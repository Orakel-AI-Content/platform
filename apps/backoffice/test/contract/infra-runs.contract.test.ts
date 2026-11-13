import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import type { SITE_LIFECYCLE } from '../../src/db/schema/index.ts';
import { infraRuns, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import { siteActivity } from '../../src/domain/builds/builds.ts';
import {
  confirmInfraReapply,
  confirmInfraRemoval,
  confirmInfraRun,
  finishInfraRun,
  recordInfraPlan,
  recordInfraStep,
  requestInfraReapply,
  requestInfraRemoval,
  requestInfraRun,
} from '../../src/domain/infra/runs.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Execuções da criação da infraestrutura (#821): o pedido, a confirmação e as gravações do
// infra-runner em `infra_runs`, o avanço do site a `infra_aplicada` no `ok` e o histórico. E as da
// remoção (#836): só admin, site pausado, domínio digitado e a volta do site a `cadastrado`. E as
// da reaplicação (#848): quem opera, de `infra_aplicada` em diante, e o site em dia no `ok`.

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

const operacao: Actor = { email: 'opa@orakel.local', roles: ['operacao'] };
const admin: Actor = { email: 'adm@orakel.local', roles: ['admin'] };
const editor: Actor = { email: 'edi@orakel.local', roles: ['editor'] };
const revisor: Actor = { email: 'rev@orakel.local', roles: ['revisor'] };
type SiteLifecycle = (typeof SITE_LIFECYCLE)[number];
const NAMESERVERS = ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'];

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  config = line.data;
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, config));
  for (const actor of [operacao, admin, editor, revisor]) {
    await upsertUser(db, { email: actor.email, name: actor.email, roles: actor.roles });
  }
});

async function lifecycle(): Promise<SiteLifecycle | undefined> {
  const [row] = await db
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, 'exemplo-a'));
  return row?.lifecycle;
}

async function setLifecycle(value: SiteLifecycle): Promise<void> {
  await db.update(sites).set({ lifecycle: value }).where(eq(sites.id, 'exemplo-a'));
}

async function runs() {
  return db.select().from(infraRuns).orderBy(infraRuns.id);
}

async function request(actor: Actor = operacao): Promise<number> {
  const result = await db.transaction((tx) => requestInfraRun(tx, actor, 'exemplo-a'));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value.id;
}

/** Execução já confirmada, `aplicando`. */
async function applying(confirmer: Actor = admin): Promise<number> {
  const id = await request();
  expect((await recordInfraPlan(db, id, '3 a criar')).ok).toBe(true);
  expect((await confirmInfraRun(db, confirmer, id)).ok).toBe(true);
  return id;
}

/** Chaves dos jobs de regravação das variantes na fila (#843). */
async function restoreJobs(): Promise<string[]> {
  const result = await db.execute(sql`
    select j.key from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = 'restore-site-media' order by j.key`);
  return (result.rows as { key: string }[]).map((row) => row.key);
}

function codes(result: { ok: boolean; issues?: { code: string }[] }): string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => issue.code);
}

describe('pedir', () => {
  it('num site cadastrado sem execução aberta grava a linha planejando com quem pediu', async () => {
    await request();
    expect(await runs()).toEqual([
      expect.objectContaining({
        siteId: 'exemplo-a',
        status: 'planejando',
        requestedBy: operacao.email,
        finishedAt: null,
      }),
    ]);
  });

  it('com execução aberta, devolve issue sem gravar', async () => {
    await request();
    const again = await db.transaction((tx) => requestInfraRun(tx, admin, 'exemplo-a'));
    expect(codes(again)).toEqual(['infra.run_open']);
    expect(await runs()).toHaveLength(1);
  });

  it('fora de cadastrado, devolve issue sem gravar', async () => {
    await setLifecycle('infra_aplicada');
    const result = await db.transaction((tx) => requestInfraRun(tx, operacao, 'exemplo-a'));
    expect(codes(result)).toEqual(['infra.lifecycle']);
    expect(await runs()).toEqual([]);
  });

  it('depois de uma falha, um novo pedido abre outra linha', async () => {
    const id = await applying();
    await finishInfraRun(db, id, { status: 'falhou', step: 'dns', message: 'x' });
    await request();
    expect((await runs()).map((run) => run.status)).toEqual(['falhou', 'planejando']);
  });

  it('o banco recusa uma segunda linha aberta para o mesmo site', async () => {
    await request();
    await expect(
      db.insert(infraRuns).values({
        siteId: 'exemplo-a',
        status: 'aguardando_confirmacao',
        requestedBy: admin.email,
      }),
    ).rejects.toThrow();
  });
});

describe('permissões', () => {
  it.each([editor, revisor])('$roles.0 recebe recusa ao pedir e ao confirmar', async (actor) => {
    const asked = await db.transaction((tx) => requestInfraRun(tx, actor, 'exemplo-a'));
    expect(codes(asked)).toEqual(['forbidden']);
    expect(await runs()).toEqual([]);

    const id = await request();
    await recordInfraPlan(db, id, 'resumo');
    expect(codes(await confirmInfraRun(db, actor, id))).toEqual(['forbidden']);
    expect((await runs())[0]).toMatchObject({
      status: 'aguardando_confirmacao',
      confirmedBy: null,
    });
  });
});

describe('transições fora de ordem', () => {
  it('confirmar só é aceito em aguardando_confirmacao', async () => {
    const id = await request();
    expect(codes(await confirmInfraRun(db, operacao, id))).toEqual(['infra.run_state']);
    expect((await runs())[0]).toMatchObject({ status: 'planejando', confirmedBy: null });

    await recordInfraPlan(db, id, 'resumo');
    expect((await confirmInfraRun(db, operacao, id)).ok).toBe(true);
    expect(codes(await confirmInfraRun(db, admin, id))).toEqual(['infra.run_state']);
    expect((await runs())[0]).toMatchObject({ status: 'aplicando', confirmedBy: operacao.email });
  });

  it('resumo, etapa e fechamento fora do estado de origem não alteram a linha', async () => {
    const id = await request();
    const before = await runs();
    expect(codes(await recordInfraStep(db, id, 'dns'))).toEqual(['infra.run_state']);
    expect(codes(await finishInfraRun(db, id, { status: 'ok', nameservers: NAMESERVERS }))).toEqual(
      ['infra.run_state'],
    );
    expect(await runs()).toEqual(before);

    await recordInfraPlan(db, id, 'resumo');
    const waiting = await runs();
    expect(codes(await recordInfraPlan(db, id, 'outro'))).toEqual(['infra.run_state']);
    expect(
      codes(await finishInfraRun(db, id, { status: 'falhou', step: null, message: 'x' })),
    ).toEqual(['infra.run_state']);
    expect(await runs()).toEqual(waiting);
  });

  it('execução inexistente devolve issue', async () => {
    expect(codes(await recordInfraStep(db, 999, 'dns'))).toEqual(['infra.run_not_found']);
  });
});

describe('fechar', () => {
  it('com ok grava os nameservers e leva o site a infra_aplicada', async () => {
    const id = await applying();
    expect((await recordInfraStep(db, id, 'email')).ok).toBe(true);
    expect((await runs())[0]?.currentStep).toBe('email');

    expect((await finishInfraRun(db, id, { status: 'ok', nameservers: NAMESERVERS })).ok).toBe(
      true,
    );
    expect((await runs())[0]).toMatchObject({
      status: 'ok',
      currentStep: null,
      nameservers: NAMESERVERS,
    });
    expect((await runs())[0]?.finishedAt).toBeInstanceOf(Date);
    expect(await lifecycle()).toBe('infra_aplicada');
  });

  it('com ok enfileira, na mesma transação, a regravação das variantes do site', async () => {
    const id = await applying();
    await db
      .transaction(async (tx) => {
        expect((await finishInfraRun(tx, id, { status: 'ok', nameservers: NAMESERVERS })).ok).toBe(
          true,
        );
        tx.rollback();
      })
      .catch(() => undefined);
    expect(await restoreJobs()).toEqual([]);
    expect((await runs())[0]?.status).toBe('aplicando');

    await db.transaction((tx) =>
      finishInfraRun(tx, id, { status: 'ok', nameservers: NAMESERVERS }),
    );
    expect(await restoreJobs()).toEqual(['restore-site-media:exemplo-a']);
  });

  it('com falhou, não enfileira a regravação', async () => {
    const id = await applying();
    await finishInfraRun(db, id, { status: 'falhou', step: 'dns', message: 'x' });
    expect(await restoreJobs()).toEqual([]);
  });

  it('com falhou grava a etapa e o motivo, sem mudar o lifecycle', async () => {
    const id = await applying();
    await recordInfraStep(db, id, 'regras');
    expect(
      (await finishInfraRun(db, id, { status: 'falhou', step: 'regras', message: 'quota' })).ok,
    ).toBe(true);
    expect((await runs())[0]).toMatchObject({
      status: 'falhou',
      failedStep: 'regras',
      failureMessage: 'quota',
      nameservers: null,
    });
    expect((await runs())[0]?.finishedAt).toBeInstanceOf(Date);
    expect(await lifecycle()).toBe('cadastrado');
  });

  it('a falha no plano fecha sem etapa', async () => {
    const id = await request();
    await finishInfraRun(db, id, { status: 'falhou', step: null, message: 'token inválido' });
    expect((await runs())[0]).toMatchObject({ status: 'falhou', failedStep: null });
  });

  it('se o advanceLifecycle recusar, a execução não fecha ok e nada é gravado', async () => {
    const id = await applying();
    await setLifecycle('zona_ativa');
    const before = await runs();
    const result = await finishInfraRun(db, id, { status: 'ok', nameservers: NAMESERVERS });
    expect(codes(result)).toEqual(['site.lifecycle_order']);
    expect(await runs()).toEqual(before);
    expect(await restoreJobs()).toEqual([]);
    expect(await lifecycle()).toBe('zona_ativa');
  });

  it('avança em nome de quem confirmou: sem site.configure, recusa', async () => {
    const id = await applying(operacao);
    await upsertUser(db, { email: operacao.email, name: operacao.email, roles: ['editor'] });
    const result = await finishInfraRun(db, id, { status: 'ok', nameservers: NAMESERVERS });
    expect(codes(result)).toEqual(['forbidden']);
    expect((await runs())[0]?.status).toBe('aplicando');
    expect(await lifecycle()).toBe('cadastrado');
  });
});

describe('siteActivity', () => {
  it('devolve a execução aberta e as fechadas no histórico, com quem pediu, quando e o resultado', async () => {
    const failed = await applying();
    await finishInfraRun(db, failed, { status: 'falhou', step: 'dns', message: 'timeout' });
    const succeeded = await applying();
    await finishInfraRun(db, succeeded, { status: 'ok', nameservers: NAMESERVERS });
    // O site já avançou; a aberta é a de um site recolocado em cadastrado.
    await setLifecycle('cadastrado');
    const open = await request(admin);
    await recordInfraPlan(db, open, '2 a criar');

    const result = await siteActivity(db, revisor, 'exemplo-a');
    if (!result.ok) throw new Error('consulta recusada');
    const rows = await runs();
    const row = (id: number) => rows.find((r) => r.id === id);
    expect(result.value.openInfra).toEqual({
      id: open,
      kind: 'criar',
      status: 'aguardando_confirmacao',
      currentStep: null,
      planSummary: '2 a criar',
      requestedBy: admin.email,
      requestedAt: row(open)?.requestedAt,
      confirmedBy: null,
    });
    expect(result.value.history).toEqual([
      {
        type: 'infra',
        id: succeeded,
        kind: 'criar',
        status: 'ok',
        requestedBy: operacao.email,
        requestedAt: row(succeeded)?.requestedAt,
        confirmedBy: admin.email,
        at: row(succeeded)?.finishedAt,
        nameservers: NAMESERVERS,
        failure: null,
      },
      {
        type: 'infra',
        id: failed,
        kind: 'criar',
        status: 'falhou',
        requestedBy: operacao.email,
        requestedAt: row(failed)?.requestedAt,
        confirmedBy: admin.email,
        at: row(failed)?.finishedAt,
        nameservers: null,
        failure: { step: 'dns', message: 'timeout' },
      },
    ]);
  });

  it('sem execução, openInfra é nulo e o histórico não tem itens de infra', async () => {
    const result = await siteActivity(db, revisor, 'exemplo-a');
    if (!result.ok) throw new Error('consulta recusada');
    expect(result.value.openInfra).toBeNull();
    expect(result.value.history).toEqual([]);
  });
});

describe('remoção', () => {
  async function site() {
    const [row] = await db.select().from(sites).where(eq(sites.id, 'exemplo-a'));
    return row;
  }

  /** Site publicado e pausado, com versão no ar, release e conferência da infra gravadas. */
  async function pausedLive(): Promise<void> {
    await db
      .update(sites)
      .set({
        lifecycle: 'publicado',
        state: 'pausado',
        pausedReason: 'remoção da infra',
        activeVersionId: 'v-123',
        release: 'site-builder:1.2.0',
        infraCheckedAt: new Date(),
        infraCheckError: 'zona sumiu',
      })
      .where(eq(sites.id, 'exemplo-a'));
  }

  async function requestRemoval(actor: Actor = admin): Promise<number> {
    const result = await db.transaction((tx) => requestInfraRemoval(tx, actor, 'exemplo-a'));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value.id;
  }

  /** Remoção com o plano gravado, `aguardando_confirmacao`. */
  async function waitingRemoval(): Promise<number> {
    const id = await requestRemoval();
    expect((await recordInfraPlan(db, id, '7 a destruir')).ok).toBe(true);
    return id;
  }

  const DOMAIN = () => config.domains[0] ?? '';

  beforeEach(pausedLive);

  describe('pedir', () => {
    it('o admin, num site pausado depois de cadastrado, grava a linha remover em planejando', async () => {
      await requestRemoval();
      expect(await runs()).toEqual([
        expect.objectContaining({
          tipo: 'remover',
          status: 'planejando',
          requestedBy: admin.email,
          finishedAt: null,
        }),
      ]);
    });

    it.each([operacao, editor, revisor])('$roles.0 recebe forbidden sem gravar', async (actor) => {
      const result = await db.transaction((tx) => requestInfraRemoval(tx, actor, 'exemplo-a'));
      expect(codes(result)).toEqual(['forbidden']);
      expect(await runs()).toEqual([]);
    });

    it('com o site ativo, devolve issue sem gravar', async () => {
      await db.update(sites).set({ state: 'ativo', pausedReason: null });
      const result = await db.transaction((tx) => requestInfraRemoval(tx, admin, 'exemplo-a'));
      expect(codes(result)).toEqual(['infra.site_not_paused']);
      expect(await runs()).toEqual([]);
    });

    it('com o site em cadastrado, devolve issue sem gravar', async () => {
      await setLifecycle('cadastrado');
      const result = await db.transaction((tx) => requestInfraRemoval(tx, admin, 'exemplo-a'));
      expect(codes(result)).toEqual(['infra.lifecycle']);
      expect(await runs()).toEqual([]);
    });

    it('criação e remoção não ficam abertas juntas no mesmo site', async () => {
      await requestRemoval();
      await setLifecycle('cadastrado');
      const creation = await db.transaction((tx) => requestInfraRun(tx, admin, 'exemplo-a'));
      expect(codes(creation)).toEqual(['infra.run_open']);

      await setLifecycle('publicado');
      const again = await db.transaction((tx) => requestInfraRemoval(tx, admin, 'exemplo-a'));
      expect(codes(again)).toEqual(['infra.run_open']);
      expect(await runs()).toHaveLength(1);
    });
  });

  describe('confirmar', () => {
    it('com o domínio exato, passa a aplicando com quem confirmou', async () => {
      const id = await waitingRemoval();
      expect((await confirmInfraRemoval(db, admin, id, DOMAIN())).ok).toBe(true);
      expect((await runs())[0]).toMatchObject({ status: 'aplicando', confirmedBy: admin.email });
      expect((await runs())[0]?.confirmedAt).toBeInstanceOf(Date);
    });

    it.each<[string, (domain: string) => string]>([
      ['com www.', (domain) => `www.${domain}`],
      ['em maiúsculas', (domain) => domain.toUpperCase()],
      ['vazio', () => ''],
      ['de outro site', () => 'outro.example'],
    ])('com o domínio %s, recusa sem gravar', async (_, typed) => {
      const id = await waitingRemoval();
      const before = await runs();
      expect(codes(await confirmInfraRemoval(db, admin, id, typed(DOMAIN())))).toEqual([
        'infra.domain_mismatch',
      ]);
      expect(await runs()).toEqual(before);
    });

    it('operação recebe forbidden sem gravar', async () => {
      const id = await waitingRemoval();
      const before = await runs();
      expect(codes(await confirmInfraRemoval(db, operacao, id, DOMAIN()))).toEqual(['forbidden']);
      expect(await runs()).toEqual(before);
    });

    it('com o site retomado depois do pedido, recusa sem gravar', async () => {
      const id = await waitingRemoval();
      await db.update(sites).set({ state: 'ativo', pausedReason: null });
      const before = await runs();
      expect(codes(await confirmInfraRemoval(db, admin, id, DOMAIN()))).toEqual([
        'infra.site_not_paused',
      ]);
      expect(await runs()).toEqual(before);
    });

    it('fora de aguardando_confirmacao, recusa', async () => {
      const id = await requestRemoval();
      expect(codes(await confirmInfraRemoval(db, admin, id, DOMAIN()))).toEqual([
        'infra.run_state',
      ]);
    });

    it('a confirmação da criação não confirma uma remoção', async () => {
      const removal = await waitingRemoval();
      const before = await runs();
      expect(codes(await confirmInfraRun(db, operacao, removal))).toEqual(['infra.run_kind']);
      expect(await runs()).toEqual(before);
    });

    it('a confirmação da remoção não confirma uma criação', async () => {
      await setLifecycle('cadastrado');
      const creation = await request(admin);
      await recordInfraPlan(db, creation, 'resumo');
      const before = await runs();
      expect(codes(await confirmInfraRemoval(db, admin, creation, DOMAIN()))).toEqual([
        'infra.run_kind',
      ]);
      expect(await runs()).toEqual(before);
    });
  });

  describe('fechar', () => {
    it('com ok, o site volta a cadastrado sem versão nem conferência, ainda pausado e com a release', async () => {
      const id = await waitingRemoval();
      await confirmInfraRemoval(db, admin, id, DOMAIN());
      expect((await recordInfraStep(db, id, 'paginas')).ok).toBe(true);

      expect((await finishInfraRun(db, id, { status: 'ok' })).ok).toBe(true);
      expect((await runs())[0]).toMatchObject({
        status: 'ok',
        currentStep: null,
        nameservers: null,
      });
      expect(await site()).toMatchObject({
        lifecycle: 'cadastrado',
        activeVersionId: null,
        infraCheckedAt: null,
        infraCheckError: null,
        state: 'pausado',
        pausedReason: 'remoção da infra',
        release: 'site-builder:1.2.0',
      });
      expect(await restoreJobs()).toEqual([]);
    });

    it('com falhou, grava a etapa e o site fica como estava', async () => {
      const id = await waitingRemoval();
      await confirmInfraRemoval(db, admin, id, DOMAIN());
      await recordInfraStep(db, id, 'paginas');
      await finishInfraRun(db, id, { status: 'falhou', step: 'paginas', message: 'token' });
      expect((await runs())[0]).toMatchObject({ status: 'falhou', failedStep: 'paginas' });
      expect(await site()).toMatchObject({ lifecycle: 'publicado', activeVersionId: 'v-123' });
    });

    it('em nome de quem confirmou: sem site.destroy, recusa sem gravar', async () => {
      const id = await waitingRemoval();
      await confirmInfraRemoval(db, admin, id, DOMAIN());
      await upsertUser(db, { email: admin.email, name: admin.email, roles: ['operacao'] });
      expect(codes(await finishInfraRun(db, id, { status: 'ok' }))).toEqual(['forbidden']);
      expect((await runs())[0]?.status).toBe('aplicando');
      expect((await site())?.lifecycle).toBe('publicado');
    });
  });

  it('o histórico traz o tipo de cada execução', async () => {
    const id = await waitingRemoval();
    await confirmInfraRemoval(db, admin, id, DOMAIN());
    await finishInfraRun(db, id, { status: 'ok' });
    const creation = await request(admin);

    const result = await siteActivity(db, revisor, 'exemplo-a');
    if (!result.ok) throw new Error('consulta recusada');
    expect(result.value.openInfra).toMatchObject({ id: creation, kind: 'criar' });
    expect(result.value.history).toEqual([
      expect.objectContaining({
        type: 'infra',
        id,
        kind: 'remover',
        status: 'ok',
        nameservers: null,
      }),
    ]);
  });
});

describe('reaplicação', () => {
  async function site() {
    const [row] = await db.select().from(sites).where(eq(sites.id, 'exemplo-a'));
    return row;
  }

  /** Site publicado com a infra marcada como desatualizada pela conferência. */
  async function outdated(): Promise<void> {
    await db
      .update(sites)
      .set({
        lifecycle: 'publicado',
        infraDriftStatus: 'desatualizado',
        infraDriftSummary: '1 a alterar',
        infraDriftCheckedAt: new Date('2026-11-01T00:00:00Z'),
        infraDriftError: 'plano anterior falhou',
      })
      .where(eq(sites.id, 'exemplo-a'));
  }

  async function requestReapply(actor: Actor = operacao): Promise<number> {
    const result = await db.transaction((tx) => requestInfraReapply(tx, actor, 'exemplo-a'));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value.id;
  }

  /** Reaplicação com o plano gravado, `aguardando_confirmacao`. */
  async function waitingReapply(actor: Actor = operacao): Promise<number> {
    const id = await requestReapply(actor);
    expect((await recordInfraPlan(db, id, '1 a alterar')).ok).toBe(true);
    return id;
  }

  /** Reaplicação confirmada, `aplicando`. */
  async function applyingReapply(confirmer: Actor = operacao): Promise<number> {
    const id = await waitingReapply();
    expect((await confirmInfraReapply(db, confirmer, id)).ok).toBe(true);
    return id;
  }

  beforeEach(outdated);

  describe('pedir', () => {
    it.each([operacao, admin])(
      '$roles.0 grava a linha reaplicar em planejando com quem pediu',
      async (actor) => {
        await requestReapply(actor);
        expect(await runs()).toEqual([
          expect.objectContaining({
            tipo: 'reaplicar',
            status: 'planejando',
            requestedBy: actor.email,
            finishedAt: null,
          }),
        ]);
      },
    );

    it.each([editor, revisor])('$roles.0 recebe forbidden sem gravar', async (actor) => {
      const result = await db.transaction((tx) => requestInfraReapply(tx, actor, 'exemplo-a'));
      expect(codes(result)).toEqual(['forbidden']);
      expect(await runs()).toEqual([]);
    });

    it.each<SiteLifecycle>(['infra_aplicada', 'zona_ativa', 'publicado'])(
      'em %s é aceito',
      async (value) => {
        await setLifecycle(value);
        await requestReapply();
        expect(await runs()).toHaveLength(1);
      },
    );

    it('com o site pausado é aceito', async () => {
      await db.update(sites).set({ state: 'pausado', pausedReason: 'manutenção' });
      await requestReapply();
      expect(await runs()).toHaveLength(1);
    });

    it('com o site em cadastrado, devolve issue sem gravar', async () => {
      await setLifecycle('cadastrado');
      const result = await db.transaction((tx) => requestInfraReapply(tx, admin, 'exemplo-a'));
      expect(codes(result)).toEqual(['infra.lifecycle']);
      expect(await runs()).toEqual([]);
    });

    it('site inexistente devolve issue', async () => {
      const result = await db.transaction((tx) => requestInfraReapply(tx, admin, 'nenhum'));
      expect(codes(result)).toEqual(['site.not_found']);
    });

    it('reaplicação, criação e remoção não ficam abertas juntas no mesmo site', async () => {
      await requestReapply();
      const reapply = await db.transaction((tx) => requestInfraReapply(tx, admin, 'exemplo-a'));
      expect(codes(reapply)).toEqual(['infra.run_open']);

      await db.update(sites).set({ state: 'pausado', pausedReason: 'remoção' });
      const removal = await db.transaction((tx) => requestInfraRemoval(tx, admin, 'exemplo-a'));
      expect(codes(removal)).toEqual(['infra.run_open']);

      await setLifecycle('cadastrado');
      const creation = await db.transaction((tx) => requestInfraRun(tx, admin, 'exemplo-a'));
      expect(codes(creation)).toEqual(['infra.run_open']);
      expect(await runs()).toHaveLength(1);
    });

    it('com uma criação aberta, a reaplicação devolve issue', async () => {
      await setLifecycle('cadastrado');
      await request(admin);
      await setLifecycle('infra_aplicada');
      const result = await db.transaction((tx) => requestInfraReapply(tx, admin, 'exemplo-a'));
      expect(codes(result)).toEqual(['infra.run_open']);
      expect(await runs()).toHaveLength(1);
    });
  });

  describe('confirmar', () => {
    it.each([operacao, admin])('$roles.0 passa a aplicando com quem confirmou', async (actor) => {
      const id = await waitingReapply();
      expect((await confirmInfraReapply(db, actor, id)).ok).toBe(true);
      expect((await runs())[0]).toMatchObject({ status: 'aplicando', confirmedBy: actor.email });
      expect((await runs())[0]?.confirmedAt).toBeInstanceOf(Date);
    });

    it.each([editor, revisor])('$roles.0 recebe forbidden sem gravar', async (actor) => {
      const id = await waitingReapply();
      const before = await runs();
      expect(codes(await confirmInfraReapply(db, actor, id))).toEqual(['forbidden']);
      expect(await runs()).toEqual(before);
    });

    it('fora de aguardando_confirmacao, recusa', async () => {
      const id = await requestReapply();
      expect(codes(await confirmInfraReapply(db, operacao, id))).toEqual(['infra.run_state']);
    });

    it('a confirmação da criação não confirma uma reaplicação', async () => {
      const id = await waitingReapply();
      const before = await runs();
      expect(codes(await confirmInfraRun(db, operacao, id))).toEqual(['infra.run_kind']);
      expect(await runs()).toEqual(before);
    });

    it('a confirmação da remoção não confirma uma reaplicação', async () => {
      const id = await waitingReapply();
      await db.update(sites).set({ state: 'pausado', pausedReason: 'remoção' });
      const before = await runs();
      expect(codes(await confirmInfraRemoval(db, admin, id, config.domains[0] ?? ''))).toEqual([
        'infra.run_kind',
      ]);
      expect(await runs()).toEqual(before);
    });

    it('a confirmação da reaplicação não confirma uma criação', async () => {
      await setLifecycle('cadastrado');
      const creation = await request(admin);
      await recordInfraPlan(db, creation, 'resumo');
      const before = await runs();
      expect(codes(await confirmInfraReapply(db, admin, creation))).toEqual(['infra.run_kind']);
      expect(await runs()).toEqual(before);
    });

    it('a confirmação da reaplicação não confirma uma remoção', async () => {
      await db.update(sites).set({ state: 'pausado', pausedReason: 'remoção' });
      const removal = await db.transaction((tx) => requestInfraRemoval(tx, admin, 'exemplo-a'));
      if (!removal.ok) throw new Error(JSON.stringify(removal.issues));
      await recordInfraPlan(db, removal.value.id, '7 a destruir');
      const before = await runs();
      expect(codes(await confirmInfraReapply(db, admin, removal.value.id))).toEqual([
        'infra.run_kind',
      ]);
      expect(await runs()).toEqual(before);
    });
  });

  describe('fechar', () => {
    it('com ok, mantém o lifecycle, não grava nameservers e deixa o site em dia', async () => {
      const id = await applyingReapply();
      expect((await recordInfraStep(db, id, 'dns')).ok).toBe(true);

      expect((await finishInfraRun(db, id, { status: 'ok', nameservers: NAMESERVERS })).ok).toBe(
        true,
      );
      const [run] = await runs();
      expect(run).toMatchObject({ status: 'ok', currentStep: null, nameservers: null });
      expect(await site()).toMatchObject({
        lifecycle: 'publicado',
        infraDriftStatus: 'em_dia',
        infraDriftSummary: null,
        infraDriftCheckedAt: run?.finishedAt,
        infraDriftError: null,
      });
    });

    it('com falhou, grava a etapa e o motivo e o site fica como estava', async () => {
      const id = await applyingReapply();
      await recordInfraStep(db, id, 'regras');
      const before = await site();
      await finishInfraRun(db, id, { status: 'falhou', step: 'regras', message: 'token' });
      expect((await runs())[0]).toMatchObject({
        status: 'falhou',
        failedStep: 'regras',
        failureMessage: 'token',
      });
      expect(await site()).toEqual(before);
    });

    it('a falha no plano fecha sem etapa e o site fica como estava', async () => {
      const id = await requestReapply();
      const before = await site();
      await finishInfraRun(db, id, { status: 'falhou', step: null, message: 'plano' });
      expect((await runs())[0]).toMatchObject({ status: 'falhou', failedStep: null });
      expect(await site()).toEqual(before);
    });

    it('em nome de quem confirmou: sem site.configure, recusa sem gravar', async () => {
      const id = await applyingReapply();
      await upsertUser(db, { email: operacao.email, name: operacao.email, roles: ['editor'] });
      const before = await site();
      expect(codes(await finishInfraRun(db, id, { status: 'ok' }))).toEqual(['forbidden']);
      expect((await runs())[0]?.status).toBe('aplicando');
      expect(await site()).toEqual(before);
    });
  });

  it('o histórico devolve o tipo reaplicar, com quem pediu, quando e o resultado', async () => {
    const failed = await applyingReapply();
    await finishInfraRun(db, failed, { status: 'falhou', step: 'dns', message: 'timeout' });
    const succeeded = await waitingReapply(admin);
    await confirmInfraReapply(db, operacao, succeeded);
    await finishInfraRun(db, succeeded, { status: 'ok' });
    const open = await requestReapply();

    const result = await siteActivity(db, revisor, 'exemplo-a');
    if (!result.ok) throw new Error('consulta recusada');
    const rows = await runs();
    const row = (id: number) => rows.find((r) => r.id === id);
    expect(result.value.openInfra).toMatchObject({
      id: open,
      kind: 'reaplicar',
      status: 'planejando',
    });
    expect(result.value.history).toEqual([
      {
        type: 'infra',
        id: succeeded,
        kind: 'reaplicar',
        status: 'ok',
        requestedBy: admin.email,
        requestedAt: row(succeeded)?.requestedAt,
        confirmedBy: operacao.email,
        at: row(succeeded)?.finishedAt,
        nameservers: null,
        failure: null,
      },
      {
        type: 'infra',
        id: failed,
        kind: 'reaplicar',
        status: 'falhou',
        requestedBy: operacao.email,
        requestedAt: row(failed)?.requestedAt,
        confirmedBy: operacao.email,
        at: row(failed)?.finishedAt,
        nameservers: null,
        failure: { step: 'dns', message: 'timeout' },
      },
    ]);
  });
});
