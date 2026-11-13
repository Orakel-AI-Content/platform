import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import type { SITE_LIFECYCLE } from '../../src/db/schema/index.ts';
import { infraRuns, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import { siteActivity } from '../../src/domain/builds/builds.ts';
import {
  confirmInfraRun,
  finishInfraRun,
  recordInfraPlan,
  recordInfraStep,
  requestInfraRun,
} from '../../src/domain/infra/runs.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Execuções da criação da infraestrutura (#821): o pedido, a confirmação e as gravações do
// infra-runner em `infra_runs`, o avanço do site a `infra_aplicada` no `ok` e o histórico.

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
