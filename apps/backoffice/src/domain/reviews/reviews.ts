import type { Issue, Result } from '@orakel/content-model';
import { and, asc, desc, eq, gte, ne, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { authors, contentVersions, redirects, reviews, taxonomies } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { listLiveContents, validateContentData } from '../content/contents.ts';
import { currentConfig, resourcesFor } from '../sites/sites.ts';
import {
  confirmedKeys,
  latestVersion,
  lockVersionInReview,
  notFound,
  refused,
  REVIEW_CHECKLIST,
} from './version-guard.ts';
import {
  computeReviewChecks,
  sitePaths,
  type ReviewCheck,
  type ReviewCheckContext,
} from './checks.ts';

export {
  confirmedKeys,
  lockVersionInReview,
  refused,
  REVIEW_CHECKLIST,
  type ReviewChecklistKey,
} from './version-guard.ts';

/** Problemas de validação da versão, contra os recursos da release do site (vazio: sem erro). */
async function validationIssues(
  db: Executor,
  siteId: string,
  contentId: number,
  data: Parameters<typeof validateContentData>[3],
): Promise<Issue[]> {
  const resources = await resourcesFor(db, siteId);
  const validated = await validateContentData(db, siteId, contentId, data, resources);
  return validated.ok ? [] : validated.issues;
}

/**
 * Validação da versão mais recente para a tela de revisão: as issues voltam como dado, não
 * como recusa. Quem edita também lê (`site.read`); aprovar exige `content.publish`.
 */
export async function reviewIssues(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<{ version: number; issues: Issue[] }>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const latest = await latestVersion(db, siteId, contentId);
  if (latest === undefined) return { ok: false, issues: [notFound(siteId, contentId)] };
  return {
    ok: true,
    value: {
      version: latest.version,
      issues: await validationIssues(db, siteId, contentId, latest.data),
    },
  };
}

/** Contexto do site para as checagens: caminhos que existem, categorias e títulos dos outros. */
async function reviewCheckContext(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<ReviewCheckContext>> {
  const live = await listLiveContents(db, actor, siteId);
  if (!live.ok) return live;
  const [taxonomyRows, authorRows, redirectRows, config, titleRows] = await Promise.all([
    db
      .select({ id: taxonomies.id, kind: taxonomies.kind, slug: taxonomies.slug })
      .from(taxonomies)
      .where(eq(taxonomies.siteId, siteId)),
    db.select({ slug: authors.slug }).from(authors).where(eq(authors.siteId, siteId)),
    db.select({ from: redirects.from }).from(redirects).where(eq(redirects.siteId, siteId)),
    currentConfig(db, siteId),
    // Versão mais recente de cada outro conteúdo do site, em qualquer status.
    db
      .selectDistinctOn([contentVersions.contentId], {
        contentId: contentVersions.contentId,
        title: sql<string>`${contentVersions.data}->>'title'`,
      })
      .from(contentVersions)
      .where(and(eq(contentVersions.siteId, siteId), ne(contentVersions.contentId, contentId)))
      .orderBy(asc(contentVersions.contentId), desc(contentVersions.version)),
  ]);
  return {
    ok: true,
    value: {
      paths: sitePaths({
        liveSlugs: live.value.filter((item) => item.id !== contentId).map((item) => item.slug),
        taxonomies: taxonomyRows,
        authorSlugs: authorRows.map((row) => row.slug),
        config,
        redirectFroms: redirectRows.map((row) => row.from),
      }),
      categoryIds: new Set(
        taxonomyRows.filter((row) => row.kind === 'category').map((row) => row.id),
      ),
      otherTitles: titleRows,
    },
  };
}

/**
 * Checagens automáticas da versão mais recente para a tela de revisão (`checks.ts`):
 * calculadas a cada leitura, nunca gravadas. Só os problemas da validação são `erro`, e
 * continuam sendo o que barra `approveVersion`; o resto é `aviso`. Exige `site.read`.
 */
export async function reviewChecks(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<{ version: number; checks: ReviewCheck[] }>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const latest = await latestVersion(db, siteId, contentId);
  if (latest === undefined) return { ok: false, issues: [notFound(siteId, contentId)] };
  const context = await reviewCheckContext(db, actor, siteId, contentId);
  if (!context.ok) return context;
  const issues = await validationIssues(db, siteId, contentId, latest.data);
  return {
    ok: true,
    value: {
      version: latest.version,
      checks: computeReviewChecks(latest.data, issues, context.value),
    },
  };
}

/** Muda só o status da versão (ADR 0015): sem mudança pendente, o snapshot não o carrega. */
async function setVersionStatus(
  tx: Executor,
  siteId: string,
  contentId: number,
  version: number,
  status: 'aprovado' | 'rascunho',
): Promise<void> {
  await tx
    .update(contentVersions)
    .set({ status })
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, version),
      ),
    );
}

/**
 * Aprova a versão que o revisor viu: precisa ser a mais recente, estar `em_revisao`, ter as
 * confirmações do checklist gravadas na versão (`confirmations.ts`, #749) e passar na validação
 * da release do site. Grava a revisão, com as chaves confirmadas, e leva a versão a `aprovado`,
 * sem mudança pendente (o status não entra no snapshot, ADR 0015).
 */
export async function approveVersion(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<Result<{ reviewId: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const locked = await lockVersionInReview(tx, siteId, contentId, version, 'aprovada');
  if (!locked.ok) return locked;
  const latest = locked.value;

  const confirmed: readonly string[] = await confirmedKeys(tx, siteId, contentId, version);
  const missing = REVIEW_CHECKLIST.filter((item) => !confirmed.includes(item.key));
  if (missing.length > 0) {
    return refused(
      'review.checklist_incomplete',
      `Marque todos os itens do checklist: falta ${missing.map((item) => item.label).join('; ')}`,
      ['checklist'],
    );
  }

  const issues = await validationIssues(tx, siteId, contentId, latest.data);
  if (issues.length > 0) return { ok: false, issues };

  const [review] = await tx
    .insert(reviews)
    .values({ siteId, contentId, version, reviewer: actor.email, checklist: [...confirmed] })
    .returning({ id: reviews.id });
  if (review === undefined) throw new Error('INSERT em reviews não devolveu o id');
  await setVersionStatus(tx, siteId, contentId, version, 'aprovado');
  return { ok: true, value: { reviewId: review.id } };
}

/**
 * Devolve ao editor a versão que o revisor viu (#598, ADR 0020): a mesma guarda da aprovação,
 * com comentário obrigatório no lugar do checklist e sem validação da release (devolver não
 * leva nada ao site). Grava a revisão como `devolvido`, com o comentário, e leva a versão de
 * volta a `rascunho`: sai da fila e pode ser reenviada como está ou depois de editada.
 */
export async function returnVersion(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  comment: string,
): Promise<Result<{ reviewId: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const text = comment.trim();
  if (text === '') {
    return refused('review.comment_required', 'Escreva o que o editor precisa corrigir.', [
      'comment',
    ]);
  }

  const locked = await lockVersionInReview(tx, siteId, contentId, version, 'devolvida');
  if (!locked.ok) return locked;

  const [review] = await tx
    .insert(reviews)
    .values({
      siteId,
      contentId,
      version,
      reviewer: actor.email,
      checklist: [],
      decision: 'devolvido',
      comment: text,
    })
    .returning({ id: reviews.id });
  if (review === undefined) throw new Error('INSERT em reviews não devolveu o id');
  await setVersionStatus(tx, siteId, contentId, version, 'rascunho');
  return { ok: true, value: { reviewId: review.id } };
}

/** Devolução que o editor ainda precisa atender: o que corrigir, quem devolveu e quando. */
export type PendingReturn = {
  version: number;
  reviewer: string;
  comment: string;
  returnedAt: Date;
};

/**
 * Devolução pendente do conteúdo (ADR 0020): a revisão mais recente, se for uma devolução e
 * nada tiver sido reenviado desde então, ou seja, a versão devolvida e todas as que vieram
 * depois continuam em `rascunho`. Continua à vista enquanto o editor salva a correção e some
 * no reenvio. `null` sem devolução pendente.
 */
export async function pendingReturn(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<PendingReturn | null>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const [last] = await db
    .select({
      version: reviews.version,
      reviewer: reviews.reviewer,
      decision: reviews.decision,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.siteId, siteId), eq(reviews.contentId, contentId)))
    .orderBy(desc(reviews.id))
    .limit(1);
  if (last === undefined || last.decision !== 'devolvido' || last.comment === null) {
    return { ok: true, value: null };
  }
  const [resubmitted] = await db
    .select({ version: contentVersions.version })
    .from(contentVersions)
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        gte(contentVersions.version, last.version),
        ne(contentVersions.status, 'rascunho'),
      ),
    )
    .limit(1);
  if (resubmitted !== undefined) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      version: last.version,
      reviewer: last.reviewer,
      comment: last.comment,
      returnedAt: last.createdAt,
    },
  };
}
