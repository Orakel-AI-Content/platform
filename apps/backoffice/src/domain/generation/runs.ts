import type { Issue, Result } from '@orakel/content-model';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  authors,
  editorialContexts,
  generationRuns,
  type GenerationStatus,
} from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { resourcesFor, siteExists } from '../sites/sites.ts';
import { currentEditorialContext } from './editorial-contexts.ts';
import type { GenerationInput, GenerationResult } from './generate.ts';

// Execuções da geração básica (RN-CON-10, R5): o disparo cria a execução e o job na mesma
// transação; a task `generate-article` lê os insumos daqui e grava o desfecho. A criação do
// artigo não passa por aqui: a task usa a rota interna (contrato motor → Backoffice).

/** Task do backoffice-worker que gera um artigo, uma vez (sem nova tentativa: R4). */
export const GENERATE_ARTICLE_TASK = 'generate-article';

export type GenerateArticlePayload = { runId: number };

export type GenerationRequest = { topic: string; authorId: number };

const refused = (code: string, message: string, path: string[] = []): Result<never> => ({
  ok: false,
  issues: [{ code, message, path }],
});

/**
 * Dispara a geração de um artigo sobre `topic` (um tema por disparo), em nome do autor do
 * site: grava a execução `pendente` com a versão vigente do contexto editorial e enfileira
 * `generate-article` com `max_attempts => 1`, tudo em `tx`. Sem contexto editorial não há o
 * que seguir: recusa sem criar nada.
 */
export async function enqueueGeneration(
  tx: Executor,
  actor: Actor,
  siteId: string,
  request: GenerationRequest,
): Promise<Result<{ runId: number }>> {
  const allowed = requireRole(actor, 'content.write');
  if (!allowed.ok) return allowed;

  const topic = typeof request.topic === 'string' ? request.topic.trim() : '';
  if (topic === '') return refused('generation.topic_empty', 'Escreva o tema do artigo', ['topic']);
  if (!(await siteExists(tx, siteId))) {
    return refused('site.not_found', `Site ${siteId} não encontrado`);
  }
  const [author] = Number.isInteger(request.authorId)
    ? await tx
        .select({ id: authors.id })
        .from(authors)
        .where(and(eq(authors.siteId, siteId), eq(authors.id, request.authorId)))
    : [];
  if (author === undefined) {
    return refused(
      'author.not_found',
      `Autor ${request.authorId} não encontrado no site ${siteId}`,
      ['authorId'],
    );
  }
  const context = await currentEditorialContext(tx, siteId);
  if (context === undefined) {
    return refused(
      'generation.no_editorial_context',
      'Cadastre o contexto editorial do site antes de gerar',
    );
  }

  const [run] = await tx
    .insert(generationRuns)
    .values({
      siteId,
      editorialContextVersion: context.version,
      topic,
      authorId: author.id,
      createdBy: actor.email,
    })
    .returning({ id: generationRuns.id });
  if (run === undefined) throw new Error('INSERT em generation_runs não devolveu o id');
  const payload: GenerateArticlePayload = { runId: run.id };
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${GENERATE_ARTICLE_TASK},
      payload => ${JSON.stringify(payload)}::json,
      max_attempts => 1
    )`);
  return { ok: true, value: { runId: run.id } };
}

/** Uma execução na lista do site: o que a operação acompanha (custo, tokens, duração). */
export type GenerationRunSummary = {
  id: number;
  createdAt: Date;
  topic: string;
  status: GenerationStatus;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Em dólares; nulo com a execução `pendente` ou o modelo fora de `LLM_PRICING`. */
  costUsd: number | null;
  durationMs: number | null;
  /** Conteúdo gerado, com a execução `ok`. */
  contentId: number | null;
};

/**
 * Execuções do site, da mais recente para a primeira (índice `generation_runs_site_created_idx`).
 * Ler exige site.read; o prompt e o erro completo ficam de fora (não há tela de detalhe).
 */
export async function listGenerationRuns(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<GenerationRunSummary[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select({
      id: generationRuns.id,
      createdAt: generationRuns.createdAt,
      topic: generationRuns.topic,
      status: generationRuns.status,
      provider: generationRuns.provider,
      model: generationRuns.model,
      inputTokens: generationRuns.inputTokens,
      outputTokens: generationRuns.outputTokens,
      costUsd: generationRuns.costUsd,
      durationMs: generationRuns.durationMs,
      contentId: generationRuns.contentId,
    })
    .from(generationRuns)
    .where(eq(generationRuns.siteId, siteId))
    .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id));
  return { ok: true, value: rows };
}

export type PendingRun = { runId: number; siteId: string; input: GenerationInput };

/**
 * Insumos da chamada ao modelo para a execução ainda `pendente`: o tema, a versão do contexto
 * gravada no disparo, o autor e os recursos da release do site. `undefined` se a execução não
 * existe ou já terminou. Sem ator: leitura interna da task; a permissão ficou no disparo.
 */
export async function pendingRun(
  db: Executor,
  runId: number,
  options: { now?: Date } = {},
): Promise<PendingRun | undefined> {
  const [row] = await db
    .select({
      siteId: generationRuns.siteId,
      topic: generationRuns.topic,
      authorId: generationRuns.authorId,
      authorName: authors.name,
      editorialContext: editorialContexts.body,
    })
    .from(generationRuns)
    .innerJoin(
      editorialContexts,
      and(
        eq(editorialContexts.siteId, generationRuns.siteId),
        eq(editorialContexts.version, generationRuns.editorialContextVersion),
      ),
    )
    .innerJoin(
      authors,
      and(eq(authors.siteId, generationRuns.siteId), eq(authors.id, generationRuns.authorId)),
    )
    .where(and(eq(generationRuns.id, runId), eq(generationRuns.status, 'pendente')));
  if (row === undefined) return undefined;
  return {
    runId,
    siteId: row.siteId,
    input: {
      topic: row.topic,
      editorialContext: row.editorialContext,
      author: { id: row.authorId, name: row.authorName },
      resources: await resourcesFor(db, row.siteId),
      publishedAt: options.now ?? new Date(),
    },
  };
}

/** O que a chamada ao modelo registrou; nulo quando a execução falhou antes dela. */
export type GenerationCall = Pick<
  GenerationResult,
  'prompt' | 'provider' | 'model' | 'usage' | 'costUsd' | 'durationMs'
>;

export type RunOutcome = { call: GenerationCall | null } & (
  { status: 'ok'; contentId: number } | { status: 'falha'; issues: Issue[] }
);

/**
 * Grava o desfecho da execução `pendente`, uma vez: devolve `false` se ela não existe ou já
 * terminou (nada é sobrescrito).
 */
export async function finishRun(
  db: Executor,
  runId: number,
  outcome: RunOutcome,
  options: { now?: Date } = {},
): Promise<boolean> {
  const { call } = outcome;
  const updated = await db
    .update(generationRuns)
    .set({
      status: outcome.status,
      contentId: outcome.status === 'ok' ? outcome.contentId : null,
      error: outcome.status === 'falha' ? outcome.issues : null,
      prompt: call?.prompt ?? null,
      provider: call?.provider ?? null,
      model: call?.model ?? null,
      inputTokens: call?.usage.inputTokens ?? null,
      outputTokens: call?.usage.outputTokens ?? null,
      costUsd: call?.costUsd ?? null,
      durationMs: call?.durationMs ?? null,
      finishedAt: options.now ?? new Date(),
    })
    .where(and(eq(generationRuns.id, runId), eq(generationRuns.status, 'pendente')))
    .returning({ id: generationRuns.id });
  return updated.length > 0;
}
