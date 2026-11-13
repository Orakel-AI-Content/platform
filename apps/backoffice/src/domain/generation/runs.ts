import type { Issue, Result } from '@orakel/content-model';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  authors,
  contentVersions,
  editorialContexts,
  generationRuns,
  reviews,
  taxonomies,
  type GenerationStatus,
} from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { resourcesFor, siteExists } from '../sites/sites.ts';
import type { CorrectionInput } from './correct.ts';
import { currentEditorialContext } from './editorial-contexts.ts';
import type { GenerationInput, GenerationResult } from './generate.ts';

// Execuções que chamam o modelo (RN-CON-10, R5): a geração básica (`geracao`) e a correção
// automática pedida na devolução (`correcao`, ADR 0023). O disparo cria a execução e o job na
// mesma transação; a task lê os insumos daqui e grava o desfecho. A gravação do artigo não
// passa por aqui: a task usa a rota interna (contrato motor → Backoffice).

/** Task do backoffice-worker que gera um artigo, uma vez (sem nova tentativa: R4). */
export const GENERATE_ARTICLE_TASK = 'generate-article';

export type GenerateArticlePayload = { runId: number };

export type GenerationRequest = { topic: string; authorId: number };

/**
 * Task do backoffice-worker que corrige a versão devolvida, uma vez por devolução: a exceção
 * à R4 da ADR 0019 (ADR 0023) é essa tentativa automática, nunca uma retentativa.
 */
export const CORRECT_ARTICLE_TASK = 'correct-article';

export type CorrectArticlePayload = { runId: number };

/** O que a devolução registra para a correção: a versão devolvida e a revisão que a pediu. */
export type CorrectionRequest = {
  siteId: string;
  contentId: number;
  baseVersion: number;
  reviewId: number;
  /** E-mail de quem devolveu. */
  createdBy: string;
};

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

/**
 * Pede a correção automática da versão devolvida (ADR 0023): grava a execução `correcao`
 * `pendente`, com o contexto editorial vigente se houver, e enfileira `correct-article`, tudo
 * em `tx`. Sem checagem de permissão nem da versão: quem chama é `returnVersion`, que já fez
 * as duas na mesma transação.
 */
export async function enqueueCorrection(
  tx: Executor,
  request: CorrectionRequest,
): Promise<{ runId: number }> {
  const context = await currentEditorialContext(tx, request.siteId);
  const [run] = await tx
    .insert(generationRuns)
    .values({
      kind: 'correcao',
      siteId: request.siteId,
      contentId: request.contentId,
      baseVersion: request.baseVersion,
      reviewId: request.reviewId,
      editorialContextVersion: context?.version ?? null,
      createdBy: request.createdBy,
    })
    .returning({ id: generationRuns.id });
  if (run === undefined) throw new Error('INSERT em generation_runs não devolveu o id');
  await scheduleCorrection(tx, run.id, request.reviewId);
  return { runId: run.id };
}

/**
 * Enfileira `correct-article` com `max_attempts => 1` e `job_key` pela revisão. Com
 * `unsafe_dedupe`, um pedido repetido para a mesma revisão não cria outro job, nem com o
 * primeiro já rodando (o `replace` padrão criaria: seria uma segunda tentativa).
 */
export async function scheduleCorrection(
  tx: Executor,
  runId: number,
  reviewId: number,
): Promise<void> {
  const payload: CorrectArticlePayload = { runId };
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${CORRECT_ARTICLE_TASK},
      payload => ${JSON.stringify(payload)}::json,
      max_attempts => 1,
      job_key => ${`${CORRECT_ARTICLE_TASK}:${reviewId}`},
      job_key_mode => 'unsafe_dedupe'
    )`);
}

/** Uma execução na lista do site: o que a operação acompanha (custo, tokens, duração). */
export type GenerationRunSummary = {
  id: number;
  createdAt: Date;
  status: GenerationStatus;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Em dólares; nulo com a execução `pendente` ou o modelo fora de `LLM_PRICING`. */
  costUsd: number | null;
  durationMs: number | null;
} & (
  | {
      kind: 'geracao';
      topic: string;
      /** Conteúdo gerado, com a execução `ok`. */
      contentId: number | null;
    }
  | {
      kind: 'correcao';
      /** Título da versão devolvida que a correção corrige. */
      contentTitle: string;
      /** Conteúdo corrigido, desde o pedido. */
      contentId: number;
    }
);

/**
 * Execuções do site, de geração e de correção, da mais recente para a primeira (índice
 * `generation_runs_site_created_idx`). Ler exige site.read; o prompt e o erro completo ficam de
 * fora (não há tela de detalhe).
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
      kind: generationRuns.kind,
      topic: generationRuns.topic,
      contentTitle: sql<string | null>`${contentVersions.data}->>'title'`,
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
    .leftJoin(
      contentVersions,
      and(
        eq(contentVersions.siteId, generationRuns.siteId),
        eq(contentVersions.contentId, generationRuns.contentId),
        eq(contentVersions.version, generationRuns.baseVersion),
      ),
    )
    .where(eq(generationRuns.siteId, siteId))
    .orderBy(desc(generationRuns.createdAt), desc(generationRuns.id));
  // Os CHECKs `generation_runs_geracao_check` e `generation_runs_correcao_check` garantem o tema
  // na `geracao` e a versão-base (com o título, obrigatório no content-model) na `correcao`.
  return {
    ok: true,
    value: rows.map(({ kind, topic, contentTitle, contentId, ...run }) =>
      kind === 'correcao'
        ? { ...run, kind, contentTitle: contentTitle ?? '', contentId: contentId ?? 0 }
        : { ...run, kind, topic: topic ?? '', contentId },
    ),
  };
}

export type PendingRun = { runId: number; siteId: string; input: GenerationInput };

/**
 * Insumos da chamada ao modelo para a execução ainda `pendente`: o tema, a versão do contexto
 * gravada no disparo, o autor, as categorias e os recursos da release do site. `undefined` se a execução não
 * existe, já terminou ou não é `geracao`. Sem ator: leitura interna da task; a permissão ficou no disparo.
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
    .where(
      and(
        eq(generationRuns.id, runId),
        eq(generationRuns.kind, 'geracao'),
        eq(generationRuns.status, 'pendente'),
      ),
    );
  if (row === undefined || row.topic === null || row.authorId === null) return undefined;
  const categories = await db
    .select({ id: taxonomies.id, slug: taxonomies.slug, name: taxonomies.name })
    .from(taxonomies)
    .where(and(eq(taxonomies.siteId, row.siteId), eq(taxonomies.kind, 'category')))
    .orderBy(asc(taxonomies.id));
  return {
    runId,
    siteId: row.siteId,
    input: {
      topic: row.topic,
      editorialContext: row.editorialContext,
      author: { id: row.authorId, name: row.authorName },
      categories,
      resources: await resourcesFor(db, row.siteId),
      publishedAt: options.now ?? new Date(),
    },
  };
}

export type PendingCorrection = {
  runId: number;
  siteId: string;
  contentId: number;
  /** Versão devolvida: a que a rota interna exige como base da N+1. */
  baseVersion: number;
  input: CorrectionInput;
};

/**
 * Insumos da correção ainda `pendente` (ADR 0023): os dados da versão devolvida, o comentário da
 * revisão que pediu a correção, o contexto editorial gravado no pedido (se houver) e os recursos
 * da release do site. `undefined` se a execução não existe, já terminou ou não é `correcao`. Sem
 * ator nem checagem da devolução: a permissão ficou na devolução, e a guarda da versão-base é da
 * rota interna, que recusa se o editor já mexeu.
 */
export async function pendingCorrection(
  db: Executor,
  runId: number,
): Promise<PendingCorrection | undefined> {
  const [row] = await db
    .select({
      siteId: generationRuns.siteId,
      contentId: generationRuns.contentId,
      baseVersion: generationRuns.baseVersion,
      data: contentVersions.data,
      comment: reviews.comment,
      editorialContext: editorialContexts.body,
    })
    .from(generationRuns)
    .innerJoin(
      contentVersions,
      and(
        eq(contentVersions.siteId, generationRuns.siteId),
        eq(contentVersions.contentId, generationRuns.contentId),
        eq(contentVersions.version, generationRuns.baseVersion),
      ),
    )
    .innerJoin(reviews, eq(reviews.id, generationRuns.reviewId))
    .leftJoin(
      editorialContexts,
      and(
        eq(editorialContexts.siteId, generationRuns.siteId),
        eq(editorialContexts.version, generationRuns.editorialContextVersion),
      ),
    )
    .where(
      and(
        eq(generationRuns.id, runId),
        eq(generationRuns.kind, 'correcao'),
        eq(generationRuns.status, 'pendente'),
      ),
    );
  // O CHECK `generation_runs_correcao_check` garante conteúdo e versão-base; a devolução exige
  // o comentário.
  if (
    row === undefined ||
    row.contentId === null ||
    row.baseVersion === null ||
    row.comment === null
  ) {
    return undefined;
  }
  return {
    runId,
    siteId: row.siteId,
    contentId: row.contentId,
    baseVersion: row.baseVersion,
    input: {
      version: row.data,
      comment: row.comment,
      ...(row.editorialContext === null ? {} : { editorialContext: row.editorialContext }),
      resources: await resourcesFor(db, row.siteId),
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
 * terminou (nada é sobrescrito). O `contentId` só muda no `ok`: na `falha` fica o que havia,
 * nulo na `geracao` e o conteúdo corrigido na `correcao`.
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
      ...(outcome.status === 'ok' ? { contentId: outcome.contentId } : {}),
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
