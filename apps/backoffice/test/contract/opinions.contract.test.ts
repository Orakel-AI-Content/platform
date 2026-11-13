import type { Content } from '@orakel/content-model/v1';
import { MockLanguageModelV4 } from 'ai/test';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions, editorialContexts, reviewOpinions } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  amendInReview,
  createContent,
  submitForReview,
  updateContent,
} from '../../src/domain/content/contents.ts';
import { resolveModel, type ResolvedModel } from '../../src/domain/generation/generate.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  reviewConfirmations,
  setAllConfirmations,
} from '../../src/domain/reviews/confirmations.ts';
import {
  listReviewOpinions,
  opinionFor,
  type OpinionTarget,
} from '../../src/domain/reviews/opinions.ts';
import { approveVersion, returnVersion } from '../../src/domain/reviews/reviews.ts';
import { createReviewOpinionTask } from '../../src/jobs/tasks/review-opinion.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Parecer automático da revisão (workspace#94): nasce pendente, com o job, na transação de
// quem leva a versão a `em_revisao`; o job grava ok ou falha; a correção sem mudar o texto
// copia o parecer. Nenhum desfecho mexe no status, nas confirmações nem na aprovação.

let db: Db;
let close: () => Promise<void>;
const SITE = 'exemplo-a';
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const FINISHED = new Date('2026-11-13T12:00:00Z');

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
  vi.stubGlobal('fetch', () => Promise.reject(new Error('rede bloqueada no teste')));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function latest(contentId: number): Promise<Omit<Content, 'id'>> {
  const rows = await db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
  const row = rows.at(-1);
  if (row === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  return row.data;
}

/** Artigo criado na tela (não pelo gerador) e enviado para revisão. */
async function createAndSubmit(): Promise<OpinionTarget> {
  const created = await db.transaction((tx) =>
    createContent(tx, SYSTEM_ACTOR, SITE, {
      kind: 'article',
      slug: 'escrito-a-mao',
      title: 'Escrito à mão',
      description: 'Um artigo escrito na tela.',
      authorIds: [],
      taxonomyIds: [],
      publishedAt: '2026-11-13T12:00:00-03:00',
      blocks: [
        {
          new: true,
          type: 'text',
          content: [
            { type: 'paragraph', children: [{ type: 'text', text: 'Primeira frase do artigo.' }] },
          ],
        },
      ],
    }),
  );
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  const submitted = await db.transaction((tx) =>
    submitForReview(tx, SYSTEM_ACTOR, SITE, created.value.id),
  );
  if (!submitted.ok) throw new Error(JSON.stringify(submitted.issues));
  return { siteId: SITE, contentId: created.value.id, version: submitted.value.version };
}

/** Conteúdo 1 com uma versão nova em revisão. */
async function submitContentOne(): Promise<OpinionTarget> {
  const base = await latest(1);
  const edited = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, 1, { ...base, title: 'Guia revisado' }),
  );
  if (!edited.ok) throw new Error(JSON.stringify(edited.issues));
  const submitted = await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));
  if (!submitted.ok) throw new Error(JSON.stringify(submitted.issues));
  return { siteId: SITE, contentId: 1, version: submitted.value.version };
}

async function amend(target: OpinionTarget, change: Partial<Omit<Content, 'id'>>) {
  const amended = await db.transaction(async (tx) =>
    amendInReview(tx, revisor, SITE, target.contentId, target.version, {
      ...(await latest(target.contentId)),
      ...change,
    }),
  );
  if (!amended.ok) throw new Error(JSON.stringify(amended.issues));
  expect(amended.value.created).toBe(true);
  return { ...target, version: amended.value.version };
}

async function jobs(target?: OpinionTarget) {
  const { rows } = await db.execute<{ payload: unknown; max_attempts: number; key: string }>(
    sql`select j.payload, j.max_attempts, j.key from graphile_worker._private_jobs j
        join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = 'review-opinion' order by j.id`,
  );
  return target === undefined
    ? rows
    : rows.filter((row) => JSON.stringify(row.payload) === JSON.stringify(target));
}

async function row(target: OpinionTarget) {
  const [found] = await db
    .select()
    .from(reviewOpinions)
    .where(
      and(
        eq(reviewOpinions.siteId, target.siteId),
        eq(reviewOpinions.contentId, target.contentId),
        eq(reviewOpinions.version, target.version),
      ),
    );
  return found;
}

/** Roda o job do parecer contra o banco de verdade. */
async function runJob(target: OpinionTarget, model: ResolvedModel = resolveModel('fixture')) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  await createReviewOpinionTask({
    db,
    generation: { model, pricing: { fixture: { input: 0.1, output: 0.5 } } },
    now: () => FINISHED,
  })(target, { logger } as unknown as JobHelpers);
}

/** Modelo que responde fora do schema. */
function invalidModel(): ResolvedModel {
  const mock = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'não é JSON' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    },
  });
  return { id: 'fixture', provider: 'anthropic', model: 'teste', languageModel: mock };
}

const read = (target: OpinionTarget, actor: Actor = revisor) => opinionFor(db, actor, target);

describe('parecer automático da revisão (workspace#94)', () => {
  it('enviar um conteúdo criado na tela grava o parecer pendente e enfileira o job, uma tentativa', async () => {
    const target = await createAndSubmit();

    expect(await row(target)).toMatchObject({ status: 'pendente', finishedAt: null });
    expect(await read(target)).toEqual({ ok: true, value: { state: 'pendente' } });
    expect(await jobs()).toEqual([
      {
        payload: target,
        max_attempts: 1,
        key: `review-opinion:${SITE}:${target.contentId}:${target.version}`,
      },
    ]);
  });

  it('a recusa do envio não grava parecer nem job', async () => {
    const target = await createAndSubmit();
    const again = await db.transaction((tx) =>
      submitForReview(tx, SYSTEM_ACTOR, SITE, target.contentId),
    );

    expect(again.ok).toBe(false);
    expect(await jobs()).toHaveLength(1);
  });

  it('com o fixture, o job conclui ok com os pontos, tokens, custo, duração e o contexto usado', async () => {
    await db.insert(editorialContexts).values({
      siteId: SITE,
      version: 1,
      body: 'Tom leve, público iniciante.',
      createdBy: 'operacao@orakel.local',
    });
    const target = await createAndSubmit();

    await runJob(target);

    expect(await row(target)).toMatchObject({
      status: 'ok',
      error: null,
      editorialContextVersion: 1,
      copiedFromVersion: null,
      provider: 'fixture',
      model: 'fixture',
      inputTokens: expect.any(Number) as number,
      outputTokens: expect.any(Number) as number,
      costUsd: expect.any(Number) as number,
      durationMs: expect.any(Number) as number,
      finishedAt: FINISHED,
    });
    const state = await read(target);
    expect(state).toMatchObject({
      ok: true,
      value: {
        state: 'pronto',
        opinion: {
          valor_original: { verdict: expect.any(String) as string },
          politicas_anuncios_afiliados: { verdict: expect.any(String) as string },
          linha_editorial: { verdict: expect.any(String) as string },
        },
      },
    });
  });

  it('com saída inválida, o job conclui falha com os problemas e os dados de execução', async () => {
    const target = await createAndSubmit();

    await runJob(target, invalidModel());

    expect(await row(target)).toMatchObject({
      status: 'falha',
      opinion: null,
      editorialContextVersion: null,
      provider: 'anthropic',
      model: 'teste',
      inputTokens: 10,
      outputTokens: 20,
      durationMs: expect.any(Number) as number,
      finishedAt: FINISHED,
    });
    expect((await row(target))?.prompt?.user).toContain('Artigo:');
    expect(await read(target)).toMatchObject({
      ok: true,
      value: { state: 'falha', issues: [{ code: 'opinion.invalid_output' }] },
    });
  });

  it.each([
    ['ok', () => resolveModel('fixture')],
    ['falha', invalidModel],
  ])('o desfecho %s não muda o status, as confirmações nem a aprovação', async (_, model) => {
    const target = await submitContentOne();
    const confirmed = await db.transaction((tx) =>
      setAllConfirmations(tx, revisor, SITE, 1, target.version, true),
    );
    if (!confirmed.ok) throw new Error(JSON.stringify(confirmed.issues));
    const before = await reviewConfirmations(db, revisor, SITE, 1, target.version);

    await runJob(target, model());

    const [version] = await db
      .select({ status: contentVersions.status })
      .from(contentVersions)
      .where(
        and(
          eq(contentVersions.siteId, SITE),
          eq(contentVersions.contentId, 1),
          eq(contentVersions.version, target.version),
        ),
      );
    expect(version?.status).toBe('em_revisao');
    expect(await reviewConfirmations(db, revisor, SITE, 1, target.version)).toEqual(before);
    const approved = await db.transaction((tx) =>
      approveVersion(tx, revisor, SITE, 1, target.version),
    );
    expect(approved.ok).toBe(true);
  });

  it('a correção que muda o texto grava parecer pendente para a N+1 e enfileira o job', async () => {
    const target = await submitContentOne();
    await runJob(target);

    const next = await amend(target, { title: 'Guia corrigido na revisão' });

    expect(await row(next)).toMatchObject({ status: 'pendente', copiedFromVersion: null });
    expect(await jobs(next)).toHaveLength(1);
  });

  it('a correção que não muda o texto copia o parecer concluído da N, sem enfileirar', async () => {
    const target = await submitContentOne();
    await runJob(target);
    const source = await row(target);

    const next = await amend(target, { publishedAt: '2026-12-01T12:00:00-03:00' });

    const copied = await row(next);
    expect(copied).toMatchObject({
      status: 'ok',
      copiedFromVersion: target.version,
      opinion: source?.opinion,
      inputTokens: source?.inputTokens,
      costUsd: source?.costUsd,
    });
    expect(await jobs(next)).toHaveLength(0);
    expect(await read(next)).toEqual(await read(target));
  });

  it('a correção que não muda o texto, com o parecer da N ainda pendente, enfileira o da N+1', async () => {
    const target = await submitContentOne();

    const next = await amend(target, { publishedAt: '2026-12-01T12:00:00-03:00' });

    expect(await row(next)).toMatchObject({ status: 'pendente', copiedFromVersion: null });
    expect(await jobs(next)).toHaveLength(1);
  });

  it('reenviar a versão devolvida volta o parecer a pendente, com um job só', async () => {
    const target = await submitContentOne();
    await runJob(target);
    const returned = await db.transaction((tx) =>
      returnVersion(tx, revisor, SITE, 1, target.version, 'Corrija a fonte.'),
    );
    expect(returned.ok).toBe(true);

    await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));

    expect(await row(target)).toMatchObject({
      status: 'pendente',
      opinion: null,
      inputTokens: null,
      finishedAt: null,
    });
    expect(await jobs()).toHaveLength(1);
  });

  it('versão sem parecer (anterior a ele existir) lê como ausente; sem site.read, recusa', async () => {
    const target = { siteId: SITE, contentId: 1, version: 1 };

    expect(await read(target)).toEqual({ ok: true, value: { state: 'ausente' } });
    const denied = await read(target, { email: 'ninguem@orakel.local', roles: [] });
    expect(denied.ok).toBe(false);
  });
});

describe('lista de pareceres do site (#796)', () => {
  it('lista os pareceres do site, o mais recente primeiro, com título, versão e o custo da chamada', async () => {
    const first = await submitContentOne();
    await runJob(first);
    const copied = await amend(first, { publishedAt: '2026-12-01T12:00:00-03:00' });
    const pending = await createAndSubmit();

    const listed = await listReviewOpinions(db, revisor, SITE);

    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    const source = await row(first);
    expect(listed.value).toEqual([
      expect.objectContaining({
        contentId: pending.contentId,
        contentTitle: 'Escrito à mão',
        version: pending.version,
        status: 'pendente',
        copiedFromVersion: null,
        costUsd: null,
        inputTokens: null,
      }),
      expect.objectContaining({
        contentId: 1,
        contentTitle: 'Guia revisado',
        version: copied.version,
        status: 'ok',
        copiedFromVersion: first.version,
      }),
      {
        contentId: 1,
        contentTitle: 'Guia revisado',
        version: first.version,
        status: 'ok',
        copiedFromVersion: null,
        provider: 'fixture',
        model: 'fixture',
        inputTokens: source?.inputTokens,
        outputTokens: source?.outputTokens,
        costUsd: source?.costUsd,
        durationMs: source?.durationMs,
        requestedAt: source?.requestedAt,
      },
    ]);
  });

  it('só devolve os pareceres do site pedido; sem site.read, recusa', async () => {
    const other = await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-b'));
    if (!other.ok) throw new Error(JSON.stringify(other.issues));
    await createAndSubmit();

    expect(await listReviewOpinions(db, revisor, 'exemplo-b')).toEqual({ ok: true, value: [] });
    const denied = await listReviewOpinions(db, { email: 'ninguem@orakel.local', roles: [] }, SITE);
    expect(denied.ok).toBe(false);
  });
});
