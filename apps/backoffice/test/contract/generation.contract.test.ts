import type { MockLanguageModelV4 } from 'ai/test';
import { and, eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ClientModule from '../../src/db/client.ts';

import { POST } from '../../src/app/api/internal/v1/contents/route.ts';
import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { authors, contentVersions, generationRuns, reviews } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { createEditorialContext } from '../../src/domain/generation/editorial-contexts.ts';
import { FIXTURE_INVALID_TOPIC } from '../../src/domain/generation/fixture.ts';
import { resolveModel, type GenerationSettings } from '../../src/domain/generation/generate.ts';
import {
  CORRECT_ARTICLE_TASK,
  enqueueCorrection,
  enqueueGeneration,
  finishRun,
  GENERATE_ARTICLE_TASK,
  listGenerationRuns,
  pendingRun,
  scheduleCorrection,
  type GenerationRequest,
} from '../../src/domain/generation/runs.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { createGenerateArticleTask } from '../../src/jobs/tasks/generate-article.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Geração básica de ponta a ponta no Postgres (#542), em LLM_MODEL=fixture: o disparo cria a
// execução e o job juntos; a task chama o modelo uma vez e cria o artigo pela rota interna de
// verdade (POST /api/internal/v1/contents, com o token do gerador), sem rede.

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const GENERATOR_TOKEN = 'g'.repeat(32);
const editor: Actor = { email: 'editora@orakel.local', roles: ['editor'] };
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };

// A rota abre o banco por getDb(): o mesmo da suíte.
const shared = vi.hoisted((): { db?: Db } => ({}));
vi.mock('@/db/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  getDb: () => ({ db: shared.db }),
}));

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  shared.db = db;
  for (const [name, value] of Object.entries({
    ACCESS_TEAM_DOMAIN: 'orakel.cloudflareaccess.com',
    ACCESS_JWKS_URL: 'https://orakel.cloudflareaccess.com/cdn-cgi/access/certs',
    ACCESS_AUD: 'aud',
    EXPORT_BUILD_TOKEN: 'b'.repeat(32),
    EXPORT_PREVIEW_TOKEN: 'p'.repeat(32),
    GENERATOR_TOKEN,
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    PREVIEW_BASE_URL: 'https://preview.orakel.localhost',
    LLM_MODEL: 'fixture',
  })) {
    vi.stubEnv(name, value);
  }
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await close();
});

let authorId: number;

beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
  const [author] = await db
    .select({ id: authors.id })
    .from(authors)
    .where(eq(authors.siteId, SITE));
  if (author === undefined) throw new Error('fixture sem autor');
  authorId = author.id;
});

async function withContext(): Promise<number> {
  const created = await db.transaction((tx) =>
    createEditorialContext(tx, editor, SITE, 'Tom leve, frases curtas.'),
  );
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  return created.value.version;
}

const enqueue = (request: Partial<GenerationRequest> = {}, actor = editor) =>
  db.transaction((tx) =>
    enqueueGeneration(tx, actor, SITE, { topic: 'Café coado em casa', authorId, ...request }),
  );

type JobRow = { task_identifier: string; payload: { runId: number }; max_attempts: number };

/** Jobs da geração (importar o site agenda um build, que fica de fora). */
async function jobs(): Promise<JobRow[]> {
  // A view `jobs` não expõe o payload; a tabela privada sim.
  const result = await db.execute(sql`
    select t.identifier as task_identifier, j.payload, j.max_attempts
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${GENERATE_ARTICLE_TASK}`);
  return result.rows as JobRow[];
}

async function runRow(runId: number) {
  const [row] = await db.select().from(generationRuns).where(eq(generationRuns.id, runId));
  if (row === undefined) throw new Error(`execução ${runId} não encontrada`);
  return row;
}

/** Roda a task como o worker, com a rota interna de verdade no lugar da rede. */
async function runTask(runId: number) {
  const settings: GenerationSettings = {
    model: resolveModel('fixture'),
    pricing: { fixture: { input: 0.1, output: 0.5 } },
  };
  const fetch = vi.fn<typeof globalThis.fetch>((url, init) => POST(new Request(url, init)));
  const helpers = { logger: { info: vi.fn(), warn: vi.fn() } } as unknown as JobHelpers;
  await createGenerateArticleTask({
    db,
    generation: settings,
    api: { url: 'http://backoffice-web:3000', token: GENERATOR_TOKEN },
    fetch,
  })({ runId }, helpers);
  const model = settings.model.languageModel as MockLanguageModelV4;
  return { fetch, modelCalls: model.doGenerateCalls.length };
}

describe('disparo da geração', () => {
  it('cria a execução pendente e o job, com uma tentativa só, na mesma transação', async () => {
    const version = await withContext();

    const enqueued = await enqueue();

    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;
    const { runId } = enqueued.value;
    expect(await runRow(runId)).toMatchObject({
      siteId: SITE,
      status: 'pendente',
      topic: 'Café coado em casa',
      authorId,
      editorialContextVersion: version,
      createdBy: editor.email,
      finishedAt: null,
    });
    expect(await jobs()).toEqual([
      { task_identifier: GENERATE_ARTICLE_TASK, payload: { runId }, max_attempts: 1 },
    ]);
  });

  it('transação desfeita não deixa nem a execução nem o job', async () => {
    await withContext();

    await expect(
      db.transaction(async (tx) => {
        await enqueueGeneration(tx, editor, SITE, { topic: 'Tema', authorId });
        throw new Error('desfaz');
      }),
    ).rejects.toThrow('desfaz');

    expect(await db.select().from(generationRuns)).toEqual([]);
    expect(await jobs()).toEqual([]);
  });

  it('recusa sem contexto editorial, sem content.write ou com autor de fora, sem criar nada', async () => {
    expect(await enqueue()).toMatchObject({
      ok: false,
      issues: [{ code: 'generation.no_editorial_context' }],
    });
    await withContext();
    expect(await enqueue({}, revisor)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await enqueue({ authorId: 9999 })).toMatchObject({
      ok: false,
      issues: [{ code: 'author.not_found' }],
    });
    expect(await enqueue({ topic: '  ' })).toMatchObject({
      ok: false,
      issues: [{ code: 'generation.topic_empty' }],
    });

    expect(await db.select().from(generationRuns)).toEqual([]);
    expect(await jobs()).toEqual([]);
  });
});

describe('lista das execuções do site', () => {
  /** Dispara em `siteId` e grava a data de criação (a de `now()` não separa os disparos). */
  async function runAt(siteId: string, author: number, topic: string, createdAt: string) {
    const enqueued = await db.transaction((tx) =>
      enqueueGeneration(tx, editor, siteId, { topic, authorId: author }),
    );
    if (!enqueued.ok) throw new Error(JSON.stringify(enqueued.issues));
    await db
      .update(generationRuns)
      .set({ createdAt: new Date(createdAt) })
      .where(eq(generationRuns.id, enqueued.value.runId));
    return enqueued.value.runId;
  }

  it('só as do site pedido, da mais recente para a primeira, com o que a tela mostra', async () => {
    await withContext();
    const other = 'exemplo-b';
    const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(other));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
    const created = await db.transaction((tx) => createEditorialContext(tx, editor, other, 'B.'));
    if (!created.ok) throw new Error(JSON.stringify(created.issues));
    const [otherAuthor] = await db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.siteId, other));
    if (otherAuthor === undefined) throw new Error('fixture sem autor');

    const oldest = await runAt(SITE, authorId, 'Primeiro', '2026-11-01T10:00Z');
    const newest = await runAt(SITE, authorId, 'Terceiro', '2026-11-03T10:00Z');
    const middle = await runAt(SITE, authorId, 'Segundo', '2026-11-02T10:00Z');
    await runAt(other, otherAuthor.id, 'De outro site', '2026-11-04T10:00Z');
    await runTask(middle);

    const listed = await listGenerationRuns(db, revisor, SITE);

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((run) => run.id)).toEqual([newest, middle, oldest]);
    expect(listed.value[0]).toEqual({
      id: newest,
      createdAt: new Date('2026-11-03T10:00Z'),
      topic: 'Terceiro',
      status: 'pendente',
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      durationMs: null,
      contentId: null,
    });
    expect(listed.value[1]).toMatchObject({
      status: 'ok',
      provider: 'fixture',
      model: 'fixture',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.00035,
    });
    expect(listed.value[1]?.contentId).toEqual(expect.any(Number));
    expect(listed.value[1]?.durationMs).toEqual(expect.any(Number));
  });

  it('recusa sem site.read', async () => {
    expect(
      await listGenerationRuns(db, { email: 'x@orakel.local', roles: [] }, SITE),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });
});

describe('task generate-article (fixture)', () => {
  it('sucesso: uma chamada, artigo em revisão pela rota interna e execução ok completa', async () => {
    const version = await withContext();
    const enqueued = await enqueue();
    if (!enqueued.ok) throw new Error(JSON.stringify(enqueued.issues));
    const { runId } = enqueued.value;

    const { fetch, modelCalls } = await runTask(runId);

    expect(modelCalls).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
    const run = await runRow(runId);
    expect(run).toMatchObject({
      status: 'ok',
      editorialContextVersion: version,
      provider: 'fixture',
      model: 'fixture',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.00035,
      error: null,
    });
    expect(run.contentId).toEqual(expect.any(Number));
    expect(run.prompt?.user).toContain('Tema: Café coado em casa');
    expect(run.prompt?.user).toContain('Tom leve, frases curtas.');
    expect(run.durationMs).toEqual(expect.any(Number));
    expect(run.finishedAt).toBeInstanceOf(Date);

    const versions = await db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, run.contentId!)));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, status: 'em_revisao' });
    expect(versions[0]?.data).toMatchObject({
      title: 'Artigo de teste: Café coado em casa',
      authorIds: [authorId],
    });
  });

  it('saída inválida: execução falha com o erro, sem nova chamada nem artigo', async () => {
    await withContext();
    const enqueued = await enqueue({ topic: FIXTURE_INVALID_TOPIC });
    if (!enqueued.ok) throw new Error(JSON.stringify(enqueued.issues));
    const { runId } = enqueued.value;
    const before = await db.select().from(contentVersions);

    const { fetch, modelCalls } = await runTask(runId);

    expect(modelCalls).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    const run = await runRow(runId);
    expect(run).toMatchObject({
      status: 'falha',
      contentId: null,
      provider: 'fixture',
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(run.error?.length).toBeGreaterThan(0);
    expect(run.finishedAt).toBeInstanceOf(Date);
    expect(await db.select().from(contentVersions)).toHaveLength(before.length);
    expect(await jobs()).toMatchObject([{ max_attempts: 1 }]);
  });

  it('execução já terminada não é refeita', async () => {
    await withContext();
    const enqueued = await enqueue();
    if (!enqueued.ok) throw new Error(JSON.stringify(enqueued.issues));
    const { runId } = enqueued.value;
    await runTask(runId);
    const first = await runRow(runId);

    const { fetch, modelCalls } = await runTask(runId);

    expect(modelCalls).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(await runRow(runId)).toEqual(first);
  });
});

describe('execuções de correção (#798)', () => {
  /** Revisão `devolvido` da primeira versão de um conteúdo do site, gravada direto. */
  async function returned(): Promise<{ contentId: number; version: number; reviewId: number }> {
    const [base] = await db
      .select({ contentId: contentVersions.contentId, version: contentVersions.version })
      .from(contentVersions)
      .where(eq(contentVersions.siteId, SITE))
      .limit(1);
    if (base === undefined) throw new Error('fixture sem versão');
    const [review] = await db
      .insert(reviews)
      .values({
        siteId: SITE,
        ...base,
        reviewer: revisor.email,
        checklist: [],
        decision: 'devolvido',
        comment: 'Corrija.',
      })
      .returning({ id: reviews.id });
    if (review === undefined) throw new Error('INSERT em reviews não devolveu o id');
    return { ...base, reviewId: review.id };
  }

  async function correction(): Promise<{ runId: number; contentId: number; reviewId: number }> {
    const { contentId, version, reviewId } = await returned();
    const { runId } = await db.transaction((tx) =>
      enqueueCorrection(tx, {
        siteId: SITE,
        contentId,
        baseVersion: version,
        reviewId,
        createdBy: revisor.email,
      }),
    );
    return { runId, contentId, reviewId };
  }

  /** Nome da restrição que o banco violou ao gravar. */
  async function violated(write: Promise<unknown>): Promise<string | undefined> {
    try {
      await write;
    } catch (error) {
      const cause = (error as { cause?: { constraint?: string } }).cause;
      return cause?.constraint;
    }
    return undefined;
  }

  it('o banco recusa uma geracao sem tema ou autor', async () => {
    const version = await withContext();
    const base = { siteId: SITE, editorialContextVersion: version, createdBy: editor.email };

    expect(await violated(db.insert(generationRuns).values({ ...base, authorId }))).toBe(
      'generation_runs_geracao_check',
    );
    expect(await violated(db.insert(generationRuns).values({ ...base, topic: 'Tema' }))).toBe(
      'generation_runs_geracao_check',
    );
    expect(await db.select().from(generationRuns)).toEqual([]);
  });

  it('o banco recusa uma correcao sem conteúdo, versão-base ou revisão', async () => {
    const { contentId, version, reviewId } = await returned();
    const full = {
      kind: 'correcao' as const,
      siteId: SITE,
      contentId,
      baseVersion: version,
      reviewId,
      createdBy: revisor.email,
    };

    for (const missing of ['contentId', 'baseVersion', 'reviewId'] as const) {
      expect(await violated(db.insert(generationRuns).values({ ...full, [missing]: null }))).toBe(
        'generation_runs_correcao_check',
      );
    }
    expect(await violated(db.insert(generationRuns).values({ ...full, topic: 'Tema' }))).toBe(
      'generation_runs_correcao_check',
    );
    expect(await db.select().from(generationRuns)).toEqual([]);
  });

  it('pendingRun e a lista do site ignoram a correcao', async () => {
    const { runId } = await correction();

    expect(await pendingRun(db, runId)).toBeUndefined();
    expect(await listGenerationRuns(db, editor, SITE)).toEqual({ ok: true, value: [] });
  });

  it('finishRun com falha mantém o conteúdo da correcao', async () => {
    const { runId, contentId } = await correction();
    const issues = [{ code: 'generation.failed', message: 'falhou', path: [] }];

    expect(await finishRun(db, runId, { status: 'falha', issues, call: null })).toBe(true);

    expect(await runRow(runId)).toMatchObject({ status: 'falha', contentId, error: issues });
  });

  it('repetir o enfileiramento para a mesma revisão não empilha jobs, nem com o job rodando', async () => {
    const { runId, reviewId } = await correction();

    await db.transaction((tx) => scheduleCorrection(tx, runId, reviewId));
    // Job travado, como pelo worker: o modo `replace` criaria um segundo.
    await db.execute(
      sql`update graphile_worker._private_jobs set locked_at = now(), locked_by = 'teste'`,
    );
    await db.transaction((tx) => scheduleCorrection(tx, runId, reviewId));

    const result = await db.execute(sql`
      select j.payload, j.max_attempts, j.key
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${CORRECT_ARTICLE_TASK}`);
    expect(result.rows).toEqual([
      { payload: { runId }, max_attempts: 1, key: `${CORRECT_ARTICLE_TASK}:${String(reviewId)}` },
    ]);
  });

  it('a correcao grava a versão vigente do contexto editorial, se houver', async () => {
    const version = await withContext();

    const { runId } = await correction();

    expect(await runRow(runId)).toMatchObject({
      kind: 'correcao',
      editorialContextVersion: version,
    });
  });
});
