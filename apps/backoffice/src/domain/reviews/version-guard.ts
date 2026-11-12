import type { Issue, Result } from '@orakel/content-model';
import { and, desc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contents, contentVersions, reviewConfirmations } from '../../db/schema/index.ts';

// Estado da versão em revisão: o checklist, a guarda comum de aprovar, devolver, marcar e
// corrigir (#750) e as confirmações gravadas. Sem importar `content/contents.ts`, que corrige
// em revisão por aqui: o módulo de revisão (`reviews.ts`) importa a edição, e o ciclo deixaria
// `REVIEW_CHECKLIST` sem valor na carga.

/**
 * Checklist da aprovação, fixo no código: só as confirmações que dependem de julgamento humano,
 * gravadas por versão à medida que o revisor marca (`confirmations.ts`, #749)
 * (RN-CON-02: valor original, políticas de anúncios e afiliados, visualização conferida).
 * Descrição das imagens (RN-CON-02) e imagens decorativas marcadas (P14) saíram: o schema do
 * bloco de imagem as garante e a validação da release barra a aprovação (ADR 0021). Aprovar
 * exige todos os itens gravados; marcar chave fora desta lista, inclusive as que saíram, é recusado.
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
  {
    key: 'visualizacao_conferida',
    label: 'Visualização conferida: o conteúdo como vai ficar no site',
  },
] as const;

export type ReviewChecklistKey = (typeof REVIEW_CHECKLIST)[number]['key'];

export const notFound = (siteId: string, contentId: number): Issue => ({
  code: 'content.not_found',
  message: `Conteúdo ${contentId} não encontrado no site ${siteId}`,
  path: [],
});

export const refused = (
  code: string,
  message: string,
  path: PropertyKey[] = [],
): Result<never> => ({
  ok: false,
  issues: [{ code, message, path }],
});

export async function latestVersion(db: Executor, siteId: string, contentId: number) {
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

/**
 * Trava a linha de `contents` (como na edição e no envio) e confere que `version` é a mais
 * recente e está `em_revisao`: a guarda comum de aprovar, devolver e marcar as confirmações
 * (`confirmations.ts`). `verb` completa a recusa ("aprovada", "devolvida", "conferida").
 */
export async function lockVersionInReview(
  tx: Executor,
  siteId: string,
  contentId: number,
  version: number,
  verb: string,
): Promise<Result<NonNullable<Awaited<ReturnType<typeof latestVersion>>>>> {
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
      `Só uma versão em revisão pode ser ${verb}: a versão ${version} está ${latest.status}`,
    );
  }
  return { ok: true, value: latest };
}

/**
 * Chaves de `REVIEW_CHECKLIST` gravadas na versão (#749), na ordem do checklist, sem checar
 * permissão: a leitura de quem já passou pela guarda (aprovar, marcar).
 */
export async function confirmedKeys(
  db: Executor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<ReviewChecklistKey[]> {
  const rows = await db
    .select({ key: reviewConfirmations.key })
    .from(reviewConfirmations)
    .where(
      and(
        eq(reviewConfirmations.siteId, siteId),
        eq(reviewConfirmations.contentId, contentId),
        eq(reviewConfirmations.version, version),
      ),
    );
  const stored = new Set(rows.map((row) => row.key));
  return REVIEW_CHECKLIST.map((item) => item.key).filter((key) => stored.has(key));
}
