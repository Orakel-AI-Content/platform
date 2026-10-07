import type { Issue, Result } from '@orakel/content-model';
import { and, desc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contents, contentVersions, reviews } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { validateContentData } from '../content/contents.ts';
import { resourcesFor } from '../sites/sites.ts';

/**
 * Checklist da aprovação, fixo no código: RN-CON-02 (valor original, políticas de anúncios e
 * afiliados, descrição das imagens, visualização conferida) e P14 (imagens decorativas
 * marcadas). Aprovar exige todos os itens marcados.
 */
export const REVIEW_CHECKLIST = [
  {
    key: 'valor_original',
    label: 'Valor original: informação, análise ou experiência que não é só paráfrase das fontes',
  },
  {
    key: 'politicas_anuncios_afiliados',
    label: 'Conforme as políticas de conteúdo dos programas de anúncios e afiliados',
  },
  { key: 'descricao_imagens', label: 'Descrição em todas as imagens de conteúdo' },
  {
    key: 'visualizacao_conferida',
    label: 'Visualização conferida: o conteúdo como vai ficar no site',
  },
  { key: 'imagens_decorativas_marcadas', label: 'Imagens decorativas marcadas como tal' },
] as const;

export type ReviewChecklistKey = (typeof REVIEW_CHECKLIST)[number]['key'];

const notFound = (siteId: string, contentId: number): Issue => ({
  code: 'content.not_found',
  message: `Conteúdo ${contentId} não encontrado no site ${siteId}`,
  path: [],
});

const refused = (code: string, message: string, path: PropertyKey[] = []): Result<never> => ({
  ok: false,
  issues: [{ code, message, path }],
});

async function latestVersion(db: Executor, siteId: string, contentId: number) {
  const [latest] = await db
    .select({
      version: contentVersions.version,
      status: contentVersions.status,
      data: contentVersions.data,
    })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, siteId), eq(contentVersions.contentId, contentId)))
    .orderBy(desc(contentVersions.version))
    .limit(1);
  return latest;
}

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

/**
 * Aprova a versão que o revisor viu: precisa ser a mais recente, estar `em_revisao`, ter o
 * checklist completo e passar na validação da release do site. Grava a revisão e leva a
 * versão a `aprovado`, sem mudança pendente (o status não entra no snapshot, ADR 0015). A
 * linha de `contents` fica travada, como na edição e no envio.
 */
export async function approveVersion(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  checklist: readonly string[],
): Promise<Result<{ reviewId: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const [content] = await tx
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)))
    .for('update');
  const latest = await latestVersion(tx, siteId, contentId);
  if (content === undefined || latest === undefined) {
    return { ok: false, issues: [notFound(siteId, contentId)] };
  }
  if (latest.version !== version) {
    return refused(
      'review.not_latest',
      `A versão ${version} não é a mais recente: o conteúdo está na versão ${latest.version}`,
    );
  }
  if (latest.status !== 'em_revisao') {
    return refused(
      'review.not_in_review',
      `Só uma versão em revisão pode ser aprovada: a versão ${version} está ${latest.status}`,
    );
  }

  const keys: readonly string[] = REVIEW_CHECKLIST.map((item) => item.key);
  const missing = REVIEW_CHECKLIST.filter((item) => !checklist.includes(item.key));
  const unknown = checklist.filter((key) => !keys.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    return refused(
      'review.checklist_incomplete',
      missing.length > 0
        ? `Marque todos os itens do checklist: falta ${missing.map((item) => item.label).join('; ')}`
        : `Item de checklist desconhecido: ${unknown.join(', ')}`,
      ['checklist'],
    );
  }

  const issues = await validationIssues(tx, siteId, contentId, latest.data);
  if (issues.length > 0) return { ok: false, issues };

  const [review] = await tx
    .insert(reviews)
    .values({
      siteId,
      contentId,
      version,
      reviewer: actor.email,
      checklist: [...new Set(checklist)],
    })
    .returning({ id: reviews.id });
  if (review === undefined) throw new Error('INSERT em reviews não devolveu o id');
  await tx
    .update(contentVersions)
    .set({ status: 'aprovado' })
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, version),
      ),
    );
  return { ok: true, value: { reviewId: review.id } };
}
