import type { Issue, Result } from '@orakel/content-model';
import { and, eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contentVersions, reviewOpinions, type ContentData } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { currentEditorialContext } from '../generation/editorial-contexts.ts';
import type { Opinion, OpinionResult } from './opinion.ts';

// Gravação do parecer automático da revisão (workspace#94): toda versão que entra em revisão
// ganha um parecer `pendente` e um job que chama `opine` uma vez e grava o desfecho. Segue
// `link-checks.ts`. O parecer só informa: nunca aprova, devolve nem impede a aprovação.

export const REVIEW_OPINION_TASK = 'review-opinion';

/** Versão do parecer: o payload do job. */
export type OpinionTarget = { siteId: string; contentId: number; version: number };

/**
 * Estado do parecer para a tela: `ausente` (versão enviada antes do parecer existir),
 * `pendente` (o job não terminou), `falha` com os problemas ou `pronto` com os pontos.
 */
export type OpinionState =
  | { state: 'ausente' }
  | { state: 'pendente' }
  | { state: 'falha'; issues: Issue[] }
  | { state: 'pronto'; opinion: Opinion };

/** Colunas do desfecho, todas nulas no parecer `pendente`. */
const EMPTY_OUTCOME = {
  status: 'pendente',
  opinion: null,
  error: null,
  editorialContextVersion: null,
  copiedFromVersion: null,
  prompt: null,
  provider: null,
  model: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  durationMs: null,
  finishedAt: null,
} as const;

const versionIs = (target: OpinionTarget) =>
  and(
    eq(reviewOpinions.siteId, target.siteId),
    eq(reviewOpinions.contentId, target.contentId),
    eq(reviewOpinions.version, target.version),
  );

/**
 * Registra o parecer pendente da versão e enfileira o job, na transação de quem leva a versão a
 * `em_revisao`. Reenvio da mesma versão volta o parecer a pendente e troca o job pelo
 * `job_key`, sem empilhar. Uma tentativa só, como a geração (R4).
 */
export async function enqueueOpinion(tx: Executor, target: OpinionTarget): Promise<void> {
  await tx
    .insert(reviewOpinions)
    .values(target)
    .onConflictDoUpdate({
      target: [reviewOpinions.siteId, reviewOpinions.contentId, reviewOpinions.version],
      set: { ...EMPTY_OUTCOME, requestedAt: sql`now()` },
    });
  const key = `review-opinion:${target.siteId}:${target.contentId}:${target.version}`;
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${REVIEW_OPINION_TASK},
      payload => ${JSON.stringify(target)}::json,
      max_attempts => 1,
      job_key => ${key},
      job_key_mode => 'replace'
    )`);
}

/**
 * Parecer da versão `to`, nascida de uma correção em revisão que não mudou o texto: copia o
 * parecer concluído de `from`, marcado com `copiedFromVersion` (não é chamada nova ao modelo).
 * Se o de `from` ainda está pendente, `to` ganha parecer próprio, senão ficaria pendente sem
 * job; se `from` não tem parecer (anterior a ele existir), `to` também fica sem.
 */
export async function carryOpinion(
  tx: Executor,
  siteId: string,
  contentId: number,
  from: number,
  to: number,
): Promise<void> {
  const [source] = await tx
    .select()
    .from(reviewOpinions)
    .where(versionIs({ siteId, contentId, version: from }));
  if (source === undefined) return;
  if (source.status === 'pendente') {
    await enqueueOpinion(tx, { siteId, contentId, version: to });
    return;
  }
  await tx.insert(reviewOpinions).values({
    ...source,
    version: to,
    copiedFromVersion: from,
    requestedAt: sql`now()`,
  });
}

/** Dados da versão e contexto editorial vigente do site; `undefined` se a versão não existe. */
export async function opinionInputFor(
  db: Executor,
  target: OpinionTarget,
): Promise<
  { data: ContentData; editorialContext: { version: number; body: string } | null } | undefined
> {
  const [row] = await db
    .select({ data: contentVersions.data })
    .from(contentVersions)
    .where(
      and(
        eq(contentVersions.siteId, target.siteId),
        eq(contentVersions.contentId, target.contentId),
        eq(contentVersions.version, target.version),
      ),
    );
  if (row === undefined) return undefined;
  const context = await currentEditorialContext(db, target.siteId);
  return {
    data: row.data,
    editorialContext:
      context === undefined ? null : { version: context.version, body: context.body },
  };
}

/** Desfecho do job: o resultado de `opine` e a versão do contexto editorial usada. */
export type OpinionOutcome = { result: OpinionResult; editorialContextVersion: number | null };

/**
 * Grava o desfecho do parecer `pendente`, uma vez: devolve `false` se ele não existe ou já
 * terminou (nada é sobrescrito), como `finishRun`.
 */
export async function recordOpinion(
  db: Executor,
  target: OpinionTarget,
  { result, editorialContextVersion }: OpinionOutcome,
  finishedAt: Date,
): Promise<boolean> {
  const updated = await db
    .update(reviewOpinions)
    .set({
      status: result.ok ? 'ok' : 'falha',
      opinion: result.ok ? result.opinion : null,
      error: result.ok ? null : result.issues,
      editorialContextVersion,
      prompt: result.prompt,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      finishedAt,
    })
    .where(and(versionIs(target), eq(reviewOpinions.status, 'pendente')))
    .returning({ version: reviewOpinions.version });
  return updated.length > 0;
}

/** Estado do parecer da versão, para a revisão. Quem edita também lê (`site.read`). */
export async function opinionFor(
  db: Executor,
  actor: Actor,
  target: OpinionTarget,
): Promise<Result<OpinionState>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const [row] = await db
    .select({
      status: reviewOpinions.status,
      opinion: reviewOpinions.opinion,
      error: reviewOpinions.error,
    })
    .from(reviewOpinions)
    .where(versionIs(target));
  if (row === undefined) return { ok: true, value: { state: 'ausente' } };
  switch (row.status) {
    case 'pendente':
      return { ok: true, value: { state: 'pendente' } };
    case 'falha':
      return { ok: true, value: { state: 'falha', issues: row.error ?? [] } };
    case 'ok':
      return { ok: true, value: { state: 'pronto', opinion: row.opinion as Opinion } };
  }
}
