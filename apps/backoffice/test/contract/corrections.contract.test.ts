import type { MockLanguageModelV4 } from 'ai/test';
import { and, asc, eq } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ClientModule from '../../src/db/client.ts';

import { POST } from '../../src/app/api/internal/v1/contents/[id]/versions/route.ts';
import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { contentVersions, generationRuns, reviews } from '../../src/db/schema/index.ts';
import { GENERATOR_ACTOR, SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  listReviewQueue,
  updateContent,
  type ContentEdit,
} from '../../src/domain/content/contents.ts';
import { createForReview } from '../../src/domain/content/generated.ts';
import { createEditorialContext } from '../../src/domain/generation/editorial-contexts.ts';
import { FIXTURE_INVALID_TOPIC } from '../../src/domain/generation/fixture.ts';
import { resolveModel, type GenerationSettings } from '../../src/domain/generation/generate.ts';
import { pendingCorrection } from '../../src/domain/generation/runs.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { pendingReturn, returnVersion } from '../../src/domain/reviews/reviews.ts';
import { createCorrectArticleTask } from '../../src/jobs/tasks/correct-article.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Correção automática de ponta a ponta no Postgres (#800), em LLM_MODEL=fixture: a devolução
// pede a correção; a task chama o modelo uma vez e grava a N+1 pela rota interna de verdade
// (POST /api/internal/v1/contents/<id>/versions, com o token do gerador), sem rede.

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const GENERATOR_TOKEN = 'g'.repeat(32);
const COMMENT = 'A temperatura da água está errada: use 92 °C.';
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const editor: Actor = { email: 'editora@orakel.local', roles: ['editor'] };

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

beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/** Artigo do gerador (versão 1 em revisão), a partir do conteúdo 1 do fixture. */
async function generated(title = 'Café coado'): Promise<number> {
  const base = (await versions(1)).at(-1)?.data;
  if (base === undefined) throw new Error('conteúdo 1 sem versão');
  const article: ContentEdit = {
    ...base,
    title,
    slug: 'cafe-coado',
    blocks: [
      {
        new: true,
        type: 'text',
        content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Use água quente.' }] }],
      },
    ],
  };
  const created = await createForReview(db, GENERATOR_ACTOR, SITE, article);
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  return created.value.id;
}

/** Devolve a versão 1 com a correção automática pedida: a execução `correcao` `pendente`. */
async function returnedWithCorrection(contentId: number): Promise<number> {
  const back = await db.transaction((tx) =>
    returnVersion(tx, revisor, SITE, contentId, 1, COMMENT, { autoCorrect: true }),
  );
  if (!back.ok || back.value.runId === undefined) throw new Error(JSON.stringify(back));
  return back.value.runId;
}

async function runRow(runId: number) {
  const [row] = await db.select().from(generationRuns).where(eq(generationRuns.id, runId));
  if (row === undefined) throw new Error(`execução ${runId} não encontrada`);
  return row;
}

/** Roda a task como o worker, com a rota interna de verdade no lugar da rede. */
async function runTask(
  runId: number,
  options: { token?: string; fetch?: typeof globalThis.fetch } = {},
) {
  const settings: GenerationSettings = {
    model: resolveModel('fixture'),
    pricing: { fixture: { input: 0.1, output: 0.5 } },
  };
  const fetch =
    options.fetch ??
    vi.fn<typeof globalThis.fetch>((url, init) => {
      const request = new Request(url, init);
      const id = /\/contents\/(\d+)\/versions$/.exec(request.url)?.[1] ?? '';
      return POST(request, { params: Promise.resolve({ id }) });
    });
  const helpers = { logger: { info: vi.fn(), warn: vi.fn() } } as unknown as JobHelpers;
  await createCorrectArticleTask({
    db,
    generation: settings,
    api: { url: 'http://backoffice-web:3000', token: options.token ?? GENERATOR_TOKEN },
    fetch,
  })({ runId }, helpers);
  const model = settings.model.languageModel as MockLanguageModelV4;
  return { modelCalls: model.doGenerateCalls.length };
}

/** A devolução continua pendente com o comentário e nenhuma versão nova foi criada. */
async function expectStillReturned(contentId: number) {
  expect((await versions(contentId)).map((row) => [row.version, row.status])).toEqual([
    [1, 'rascunho'],
  ]);
  expect(await pendingReturn(db, revisor, SITE, contentId)).toMatchObject({
    ok: true,
    value: { version: 1, comment: COMMENT },
  });
}

describe('correção automática pela task correct-article', () => {
  it('leva a N+1 do gerador à fila e termina a execução ok com o conteúdo', async () => {
    const id = await generated();
    const runId = await returnedWithCorrection(id);

    const { modelCalls } = await runTask(runId);

    expect(modelCalls).toBe(1);
    const rows = await versions(id);
    expect(rows.map((row) => [row.version, row.status, row.createdBy])).toEqual([
      [1, 'rascunho', 'generator'],
      [2, 'em_revisao', 'generator'],
    ]);
    expect(rows[1]?.data.blocks).not.toEqual(rows[0]?.data.blocks);
    const run = await runRow(runId);
    expect(run).toMatchObject({
      kind: 'correcao',
      status: 'ok',
      contentId: id,
      baseVersion: 1,
      error: null,
      provider: 'fixture',
      model: 'fixture',
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(run.prompt?.user).toContain(COMMENT);
    expect(run.finishedAt).not.toBeNull();
    // A versão criada é sempre a seguinte à base (ADR 0023 e #800): é assim que a fila a deriva.
    expect(rows.at(-1)?.version).toBe(run.baseVersion! + 1);
    expect(await pendingReturn(db, revisor, SITE, id)).toEqual({ ok: true, value: null });
    const queue = await listReviewQueue(db, revisor, SITE);
    expect(queue.ok && queue.value.map((item) => item.id)).toContain(id);
  });

  it('nunca aprova nem publica: a versão corrigida espera a decisão humana', async () => {
    const id = await generated();
    const runId = await returnedWithCorrection(id);
    const before = await db.select().from(reviews);

    await runTask(runId);

    expect((await versions(id)).at(-1)?.status).toBe('em_revisao');
    expect(await db.select().from(reviews)).toEqual(before);
  });

  it('leva o contexto editorial gravado no pedido ao prompt', async () => {
    const created = await db.transaction((tx) =>
      createEditorialContext(tx, editor, SITE, 'Tom leve, frases curtas.'),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));
    const id = await generated();
    const runId = await returnedWithCorrection(id);

    const pending = await pendingCorrection(db, runId);

    expect(pending).toMatchObject({
      runId,
      siteId: SITE,
      contentId: id,
      baseVersion: 1,
      input: { comment: COMMENT, editorialContext: 'Tom leve, frases curtas.' },
    });
    await runTask(runId);
    expect((await runRow(runId)).prompt?.user).toContain('Tom leve, frases curtas.');
  });

  it('saída inválida do modelo termina em falha com os dados da execução, e o artigo continua devolvido', async () => {
    const id = await generated(FIXTURE_INVALID_TOPIC);
    const runId = await returnedWithCorrection(id);

    await runTask(runId);

    const run = await runRow(runId);
    expect(run).toMatchObject({ status: 'falha', contentId: id, provider: 'fixture' });
    expect(run.error?.length).toBeGreaterThan(0);
    expect(run.prompt).not.toBeNull();
    expect(run.durationMs).not.toBeNull();
    await expectStillReturned(id);
  });

  it('recusa da rota termina em falha com o status, e o artigo continua devolvido', async () => {
    const id = await generated();
    const runId = await returnedWithCorrection(id);

    await runTask(runId, { token: 'x'.repeat(32) });

    expect(await runRow(runId)).toMatchObject({
      status: 'falha',
      error: [
        { code: 'correction.api_refused', message: expect.stringContaining('401') as string },
      ],
      provider: 'fixture',
    });
    await expectStillReturned(id);
  });

  it('rota inacessível termina em falha, sem lançar, e o artigo continua devolvido', async () => {
    const id = await generated();
    const runId = await returnedWithCorrection(id);

    await runTask(runId, { fetch: () => Promise.reject(new Error('ECONNREFUSED')) });

    expect(await runRow(runId)).toMatchObject({
      status: 'falha',
      error: [{ code: 'correction.api_unreachable' }],
    });
    await expectStillReturned(id);
  });

  it('o editor salvou antes do job: base desatualizada e a versão do editor fica intacta', async () => {
    const id = await generated();
    const runId = await returnedWithCorrection(id);
    const base = (await versions(id)).at(-1)?.data;
    if (base === undefined) throw new Error('sem versão');
    const saved = await db.transaction((tx) =>
      updateContent(tx, editor, SITE, id, { ...base, title: 'Título do editor' }),
    );
    expect(saved.ok).toBe(true);
    const before = await versions(id);

    await runTask(runId);

    const run = await runRow(runId);
    expect(run.status).toBe('falha');
    expect(run.error?.map((issue) => issue.code)).toEqual([
      'correction.api_refused',
      'content.base_outdated',
    ]);
    expect(await versions(id)).toEqual(before);
    expect(before.at(-1)).toMatchObject({ version: 2, status: 'rascunho' });
    expect(before.at(-1)?.data.title).toBe('Título do editor');
  });

  it('execução já terminada é ignorada: nem modelo, nem versão nova', async () => {
    const id = await generated();
    const runId = await returnedWithCorrection(id);
    await runTask(runId);
    const after = await versions(id);
    const finished = await runRow(runId);

    const { modelCalls } = await runTask(runId);

    expect(modelCalls).toBe(0);
    expect(await versions(id)).toEqual(after);
    expect(await runRow(runId)).toEqual(finished);
  });
});
