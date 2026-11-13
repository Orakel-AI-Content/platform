import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { infraBatches, infraRuns, sites } from '../../src/db/schema/index.ts';
import type { Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import {
  confirmInfraBatch,
  finishInfraRun,
  infraActivity,
  latestInfraBatch,
  recordInfraPlan,
  recordInfraStep,
  requestInfraBatch,
  requestInfraReapply,
} from '../../src/domain/infra/runs.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Lote "reaplicar em todos os desatualizados" (#850): uma execução `reaplicar` por site
// desatualizado, na ordem do id, todos os planos antes, uma confirmação para todas e o apply de um
// site por vez, parando na primeira falha com as execuções seguintes `cancelado`.

let db: Db;
let close: () => Promise<void>;

const operacao: Actor = { email: 'opa@orakel.local', roles: ['operacao'] };
const admin: Actor = { email: 'adm@orakel.local', roles: ['admin'] };
const editor: Actor = { email: 'edi@orakel.local', roles: ['editor'] };
const revisor: Actor = { email: 'rev@orakel.local', roles: ['revisor'] };

const outdated = { lifecycle: 'publicado', infraDriftStatus: 'desatualizado' } as const;
const site = (id: string, values: Partial<typeof sites.$inferInsert> = {}) =>
  db.insert(sites).values({ id, name: id, ...values });

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  for (const actor of [operacao, admin, editor, revisor]) {
    await upsertUser(db, { email: actor.email, name: actor.email, roles: actor.roles });
  }
});

function codes(result: { ok: boolean; issues?: { code: string }[] }): string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => issue.code);
}

/** Três sites desatualizados (c, a, b) e outros que ficam de fora do lote. */
async function seedNetwork(): Promise<void> {
  await site('site-c', outdated);
  await site('site-a', { ...outdated, state: 'pausado' });
  await site('site-b', { ...outdated, lifecycle: 'infra_aplicada' });
  await site('em-dia', { lifecycle: 'publicado', infraDriftStatus: 'em_dia' });
  await site('nunca-conferido', { lifecycle: 'publicado' });
  await site('cadastrado', { infraDriftStatus: 'desatualizado' });
}

async function request(actor: Actor = operacao) {
  const result = await db.transaction((tx) => requestInfraBatch(tx, actor));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

async function batchRuns() {
  return db
    .select({
      siteId: infraRuns.siteId,
      position: infraRuns.batchPosition,
      status: infraRuns.status,
      confirmedBy: infraRuns.confirmedBy,
      confirmedAt: infraRuns.confirmedAt,
      finishedAt: infraRuns.finishedAt,
    })
    .from(infraRuns)
    .orderBy(infraRuns.batchPosition);
}

async function batchState() {
  const [row] = await db.select().from(infraBatches);
  return row;
}

/** Lote de três sites com todos os planos gravados, à espera da confirmação. */
async function planned() {
  await seedNetwork();
  const batch = await request();
  for (const run of batch.runs) {
    expect((await db.transaction((tx) => recordInfraPlan(tx, run.runId, '1 a mudar'))).ok).toBe(
      true,
    );
  }
  return batch;
}

/** Lote confirmado: o primeiro site aplicando. */
async function confirmed() {
  const batch = await planned();
  const first = await db.transaction((tx) => confirmInfraBatch(tx, operacao, batch.id));
  if (!first.ok) throw new Error(JSON.stringify(first.issues));
  return { batch, first: first.value };
}

const runIdOf = (batch: { runs: { siteId: string; runId: number }[] }, siteId: string) =>
  batch.runs.find((run) => run.siteId === siteId)?.runId ?? -1;

describe('pedir o lote', () => {
  it('cria uma execução reaplicar planejando por site desatualizado, na ordem do id', async () => {
    await seedNetwork();
    const batch = await request();

    expect(batch.runs.map((run) => run.siteId)).toEqual(['site-a', 'site-b', 'site-c']);
    const rows = await db.select().from(infraRuns).orderBy(infraRuns.batchPosition);
    expect(
      rows.map(({ siteId, tipo, status, batchId, batchPosition, requestedBy }) => ({
        siteId,
        tipo,
        status,
        batchId,
        batchPosition,
        requestedBy,
      })),
    ).toEqual(
      ['site-a', 'site-b', 'site-c'].map((siteId, position) => ({
        siteId,
        tipo: 'reaplicar',
        status: 'planejando',
        batchId: batch.id,
        batchPosition: position,
        requestedBy: operacao.email,
      })),
    );
    expect(await batchState()).toMatchObject({
      state: 'planejando',
      requestedBy: operacao.email,
      finishedAt: null,
    });
  });

  it('o admin também pede; editor e revisor são recusados sem gravar nada', async () => {
    await seedNetwork();
    for (const actor of [editor, revisor]) {
      const result = await db.transaction((tx) => requestInfraBatch(tx, actor));
      expect(codes(result)).toEqual(['forbidden']);
    }
    expect(await db.select().from(infraBatches)).toEqual([]);
    expect(await db.select().from(infraRuns)).toEqual([]);
    expect((await request(admin)).runs).toHaveLength(3);
  });

  it('deixa de fora o site desatualizado com execução de infra aberta', async () => {
    await seedNetwork();
    expect((await db.transaction((tx) => requestInfraReapply(tx, operacao, 'site-b'))).ok).toBe(
      true,
    );
    const batch = await request();
    expect(batch.runs.map((run) => run.siteId)).toEqual(['site-a', 'site-c']);
  });

  it('sem site desatualizado, é recusado sem gravar o lote', async () => {
    await site('em-dia', { lifecycle: 'publicado', infraDriftStatus: 'em_dia' });
    const result = await db.transaction((tx) => requestInfraBatch(tx, operacao));
    expect(codes(result)).toEqual(['infra.batch_empty']);
    expect(await db.select().from(infraBatches)).toEqual([]);
  });

  it('um segundo lote é recusado enquanto há um aberto', async () => {
    await seedNetwork();
    await request();
    await site('site-d', outdated);
    const result = await db.transaction((tx) => requestInfraBatch(tx, operacao));
    expect(codes(result)).toEqual(['infra.batch_open']);
    expect(await db.select().from(infraBatches)).toHaveLength(1);
  });

  it('a execução aberta do site no lote vem marcada inBatch; a pedida no site, não', async () => {
    await seedNetwork();
    await request();
    await site('avulso', { lifecycle: 'publicado' });
    const single = await db.transaction((tx) => requestInfraReapply(tx, operacao, 'avulso'));
    expect(single.ok).toBe(true);

    expect((await infraActivity(db, 'site-a', 10)).open).toMatchObject({ inBatch: true });
    expect((await infraActivity(db, 'avulso', 10)).open).toMatchObject({ inBatch: false });
  });

  it('o banco recusa dois lotes abertos (índice único parcial)', async () => {
    await db.insert(infraBatches).values({ requestedBy: operacao.email });
    await expect(
      db.insert(infraBatches).values({ state: 'aplicando', requestedBy: operacao.email }),
    ).rejects.toThrow();
  });
});

describe('confirmar o lote', () => {
  it('só depois do último plano; antes, é recusada', async () => {
    await seedNetwork();
    const batch = await request();
    expect((await db.transaction((tx) => recordInfraPlan(tx, batch.runs[0]!.runId, 'x'))).ok).toBe(
      true,
    );
    expect((await batchState())?.state).toBe('planejando');
    const early = await db.transaction((tx) => confirmInfraBatch(tx, operacao, batch.id));
    expect(codes(early)).toEqual(['infra.batch_state']);
    expect((await batchRuns()).every((run) => run.confirmedBy === null)).toBe(true);
  });

  it('confirma todas as execuções com quem confirmou; só a primeira fica aplicando', async () => {
    const batch = await planned();
    expect((await batchState())?.state).toBe('aguardando_confirmacao');

    const result = await db.transaction((tx) => confirmInfraBatch(tx, operacao, batch.id));
    expect(result).toEqual({
      ok: true,
      value: { siteId: 'site-a', runId: runIdOf(batch, 'site-a') },
    });
    const rows = await batchRuns();
    expect(rows.map((run) => run.status)).toEqual([
      'aplicando',
      'aguardando_confirmacao',
      'aguardando_confirmacao',
    ]);
    expect(rows.every((run) => run.confirmedBy === operacao.email)).toBe(true);
    expect(rows.every((run) => run.confirmedAt instanceof Date)).toBe(true);
    expect((await batchState())?.state).toBe('aplicando');
  });

  it('editor e revisor são recusados; o lote inexistente também', async () => {
    const batch = await planned();
    for (const actor of [editor, revisor]) {
      const result = await db.transaction((tx) => confirmInfraBatch(tx, actor, batch.id));
      expect(codes(result)).toEqual(['forbidden']);
    }
    const missing = await db.transaction((tx) => confirmInfraBatch(tx, operacao, 999));
    expect(codes(missing)).toEqual(['infra.batch_not_found']);
    expect((await batchRuns()).every((run) => run.confirmedBy === null)).toBe(true);
  });

  it('o site que espera a vez não recebe etapa', async () => {
    const { batch } = await confirmed();
    const step = await db.transaction((tx) => recordInfraStep(tx, runIdOf(batch, 'site-b'), 'dns'));
    expect(codes(step)).toEqual(['infra.run_state']);
  });
});

describe('avançar e parar', () => {
  it('o ok de um site libera o próximo; o ok do último conclui o lote', async () => {
    const { batch } = await confirmed();

    const a = await db.transaction((tx) =>
      finishInfraRun(tx, runIdOf(batch, 'site-a'), { status: 'ok' }),
    );
    expect(a).toEqual({
      ok: true,
      value: { next: { siteId: 'site-b', runId: runIdOf(batch, 'site-b') } },
    });
    expect((await batchRuns()).map((run) => run.status)).toEqual([
      'ok',
      'aplicando',
      'aguardando_confirmacao',
    ]);

    await db.transaction((tx) => finishInfraRun(tx, runIdOf(batch, 'site-b'), { status: 'ok' }));
    const c = await db.transaction((tx) =>
      finishInfraRun(tx, runIdOf(batch, 'site-c'), { status: 'ok' }),
    );
    expect(c).toEqual({ ok: true, value: { next: null } });
    const done = await batchState();
    expect(done?.state).toBe('concluido');
    expect(done?.finishedAt).toBeInstanceOf(Date);

    const drift = await db
      .select({ id: sites.id, status: sites.infraDriftStatus })
      .from(sites)
      .where(eq(sites.lifecycle, 'publicado'))
      .orderBy(sites.id);
    expect(drift.find((row) => row.id === 'site-c')?.status).toBe('em_dia');
  });

  it('na falha de um site, o lote interrompe e os seguintes ficam cancelado e desatualizados', async () => {
    const { batch } = await confirmed();
    await db.transaction((tx) => finishInfraRun(tx, runIdOf(batch, 'site-a'), { status: 'ok' }));

    const b = await db.transaction((tx) =>
      finishInfraRun(tx, runIdOf(batch, 'site-b'), {
        status: 'falhou',
        step: 'dns',
        message: 'token sem permissão de DNS',
      }),
    );
    expect(b).toEqual({ ok: true, value: { next: null } });

    const rows = await batchRuns();
    expect(rows.map((run) => run.status)).toEqual(['ok', 'falhou', 'cancelado']);
    expect(rows[2]?.finishedAt).toBeInstanceOf(Date);
    const stopped = await batchState();
    expect(stopped?.state).toBe('interrompido');
    expect(stopped?.finishedAt).toBeInstanceOf(Date);
    const [siteC] = await db
      .select({ status: sites.infraDriftStatus })
      .from(sites)
      .where(eq(sites.id, 'site-c'));
    expect(siteC?.status).toBe('desatualizado');

    // O cancelado nunca aplica, e um lote novo pode ser pedido.
    const late = await db.transaction((tx) => recordInfraStep(tx, runIdOf(batch, 'site-c'), 'dns'));
    expect(codes(late)).toEqual(['infra.run_state']);
    expect((await request()).runs.map((run) => run.siteId)).toEqual(['site-b', 'site-c']);
  });

  it('a falha de um plano interrompe o lote antes da confirmação', async () => {
    await seedNetwork();
    const batch = await request();
    await db.transaction((tx) => recordInfraPlan(tx, runIdOf(batch, 'site-a'), 'x'));
    await db.transaction((tx) =>
      finishInfraRun(tx, runIdOf(batch, 'site-b'), {
        status: 'falhou',
        step: null,
        message: 'plano falhou',
      }),
    );

    expect((await batchRuns()).map((run) => run.status)).toEqual([
      'cancelado',
      'falhou',
      'cancelado',
    ]);
    expect((await batchState())?.state).toBe('interrompido');
    const lateplan = await db.transaction((tx) =>
      recordInfraPlan(tx, runIdOf(batch, 'site-c'), 'x'),
    );
    expect(codes(lateplan)).toEqual(['infra.run_state']);
  });
});

describe('ler o progresso', () => {
  it('sem lote, devolve null; editor e revisor são recusados', async () => {
    expect(await latestInfraBatch(db, operacao)).toEqual({ ok: true, value: null });
    for (const actor of [editor, revisor]) {
      expect(codes(await latestInfraBatch(db, actor))).toEqual(['forbidden']);
    }
  });

  it('traz cada site na ordem com o estado e, no que falhou, a etapa e o motivo', async () => {
    const { batch } = await confirmed();
    await db.transaction((tx) => finishInfraRun(tx, runIdOf(batch, 'site-a'), { status: 'ok' }));
    await db.transaction((tx) =>
      finishInfraRun(tx, runIdOf(batch, 'site-b'), {
        status: 'falhou',
        step: 'email',
        message: 'limite de regras de e-mail',
      }),
    );

    const result = await latestInfraBatch(db, operacao);
    if (!result.ok || result.value === null) throw new Error('sem lote');
    expect(result.value).toMatchObject({
      id: batch.id,
      state: 'interrompido',
      requestedBy: operacao.email,
    });
    expect(
      result.value.sites.map(({ siteId, position, status, failure }) => ({
        siteId,
        position,
        status,
        failure,
      })),
    ).toEqual([
      { siteId: 'site-a', position: 0, status: 'ok', failure: null },
      {
        siteId: 'site-b',
        position: 1,
        status: 'falhou',
        failure: { step: 'email', message: 'limite de regras de e-mail' },
      },
      { siteId: 'site-c', position: 2, status: 'cancelado', failure: null },
    ]);
  });
});
