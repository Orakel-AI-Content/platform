import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { infraRuns, sites } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import { summarizePlan } from '../../src/domain/infra/drivers.ts';
import {
  confirmInfraPlan,
  INFRA_PLAN_FAILED_MESSAGE,
  readInfraPlan,
  requestInfraPlan,
} from '../../src/domain/infra/plan.ts';
import { finishInfraRun, recordInfraPlan } from '../../src/domain/infra/runs.ts';
import { INFRA_APPLY_TASK, INFRA_PLAN_TASK } from '../../src/domain/infra/schedule.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// "Criar infraestrutura" pelo Backoffice (#825): o pedido e a confirmação enfileiram a task na
// mesma transação; cancelar não grava nada (a execução fica aberta); a leitura do plano devolve
// o resumo validado.

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

const SITE = 'exemplo-a';
const operacao: Actor = { email: 'opa@orakel.local', roles: ['operacao'] };
const admin: Actor = { email: 'adm@orakel.local', roles: ['admin'] };
const editor: Actor = { email: 'edi@orakel.local', roles: ['editor'] };
const revisor: Actor = { email: 'rev@orakel.local', roles: ['revisor'] };

const SUMMARY = summarizePlan([
  { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone', action: 'create' },
  {
    address: 'module.site.cloudflare_dns_record.apex',
    type: 'cloudflare_dns_record',
    action: 'create',
  },
]);

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture(SITE)).find((l) => l.type === 'config');
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

async function jobs() {
  const { rows } = await db.execute<{ task_identifier: string; queue_name: string }>(
    sql`select task_identifier, queue_name from graphile_worker.jobs
        where queue_name like 'infra:%' order by id`,
  );
  return rows.map((row) => row.task_identifier);
}

async function runs() {
  return db.select().from(infraRuns).orderBy(infraRuns.id);
}

async function request(actor: Actor = operacao): Promise<number> {
  const result = await db.transaction((tx) => requestInfraPlan(tx, actor, SITE));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value.runId;
}

/** Execução com o plano gravado, `aguardando_confirmacao`. */
async function planned(summary: string = JSON.stringify(SUMMARY)): Promise<number> {
  const runId = await request();
  expect((await recordInfraPlan(db, runId, summary)).ok).toBe(true);
  return runId;
}

function codes(result: { ok: boolean; issues?: { code: string }[] }): string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => issue.code);
}

describe('pedir o plano', () => {
  it('grava a execução planejando e enfileira o plano na mesma transação', async () => {
    const runId = await request();
    expect(await runs()).toEqual([expect.objectContaining({ id: runId, status: 'planejando' })]);
    expect(await jobs()).toEqual([INFRA_PLAN_TASK]);
  });

  it('recusado (execução aberta), não enfileira outro plano', async () => {
    await request();
    const again = await db.transaction((tx) => requestInfraPlan(tx, admin, SITE));
    expect(codes(again)).toEqual(['infra.run_open']);
    expect(await jobs()).toEqual([INFRA_PLAN_TASK]);
  });
});

describe('confirmar', () => {
  it('leva a execução a aplicando e enfileira o apply na mesma transação', async () => {
    const runId = await planned();
    const result = await db.transaction((tx) => confirmInfraPlan(tx, admin, SITE, runId));
    expect(result.ok).toBe(true);
    expect((await runs())[0]).toMatchObject({ status: 'aplicando', confirmedBy: admin.email });
    expect(await jobs()).toEqual([INFRA_PLAN_TASK, INFRA_APPLY_TASK]);
  });

  it('antes do resumo, recusa sem enfileirar o apply', async () => {
    const runId = await request();
    const result = await db.transaction((tx) => confirmInfraPlan(tx, admin, SITE, runId));
    expect(codes(result)).toEqual(['infra.run_state']);
    expect(await jobs()).toEqual([INFRA_PLAN_TASK]);
  });

  it('execução de outro site é recusada', async () => {
    const runId = await planned();
    const result = await db.transaction((tx) => confirmInfraPlan(tx, admin, 'outro', runId));
    expect(codes(result)).toEqual(['infra.run_not_found']);
    expect((await runs())[0]?.status).toBe('aguardando_confirmacao');
  });

  it.each([editor, revisor])('$roles.0 recebe recusa sem gravar', async (actor) => {
    const runId = await planned();
    const result = await db.transaction((tx) => confirmInfraPlan(tx, actor, SITE, runId));
    expect(codes(result)).toEqual(['forbidden']);
    expect((await runs())[0]?.status).toBe('aguardando_confirmacao');
  });
});

describe('cancelar', () => {
  it('sem confirmação, a execução continua aguardando e o site cadastrado', async () => {
    const runId = await planned();
    // "Cancelar" só fecha o diálogo: nenhuma escrita. Reabrir lê o mesmo resumo.
    expect(await runs()).toEqual([
      expect.objectContaining({ status: 'aguardando_confirmacao', confirmedBy: null }),
    ]);
    const [site] = await db
      .select({ lifecycle: sites.lifecycle })
      .from(sites)
      .where(eq(sites.id, SITE));
    expect(site?.lifecycle).toBe('cadastrado');
    const read = await readInfraPlan(db, operacao, SITE, runId);
    expect(read).toEqual({
      ok: true,
      value: { status: 'aguardando_confirmacao', summary: SUMMARY },
    });
  });
});

describe('ler o plano', () => {
  it('planejando enquanto o plano roda', async () => {
    const runId = await request();
    expect(await readInfraPlan(db, operacao, SITE, runId)).toEqual({
      ok: true,
      value: { status: 'planejando' },
    });
  });

  it('resumo ilegível vem nulo', async () => {
    const runId = await planned('3 a criar');
    expect(await readInfraPlan(db, operacao, SITE, runId)).toEqual({
      ok: true,
      value: { status: 'aguardando_confirmacao', summary: null },
    });
  });

  it('o plano que falhou traz o motivo', async () => {
    const runId = await request();
    await finishInfraRun(db, runId, { status: 'falhou', step: null, message: 'token inválido' });
    expect(await readInfraPlan(db, operacao, SITE, runId)).toEqual({
      ok: true,
      value: { status: 'falhou', message: 'token inválido' },
    });
  });

  it('sem motivo gravado, usa a mensagem padrão', async () => {
    const runId = await request();
    await db
      .update(infraRuns)
      .set({ status: 'falhou', finishedAt: new Date() })
      .where(eq(infraRuns.id, runId));
    expect(await readInfraPlan(db, operacao, SITE, runId)).toEqual({
      ok: true,
      value: { status: 'falhou', message: INFRA_PLAN_FAILED_MESSAGE },
    });
  });

  it('depois de confirmada, diz aplicando', async () => {
    const runId = await planned();
    await db.transaction((tx) => confirmInfraPlan(tx, admin, SITE, runId));
    expect(await readInfraPlan(db, admin, SITE, runId)).toEqual({
      ok: true,
      value: { status: 'aplicando' },
    });
  });

  it('editor recebe recusa', async () => {
    const runId = await request();
    expect(codes(await readInfraPlan(db, editor, SITE, runId))).toEqual(['forbidden']);
  });

  it('execução inexistente é recusada', async () => {
    expect(codes(await readInfraPlan(db, admin, SITE, 999))).toEqual(['infra.run_not_found']);
  });
});
