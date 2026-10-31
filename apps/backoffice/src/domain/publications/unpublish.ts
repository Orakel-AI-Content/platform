import type { Issue, Result } from '@orakel/content-model';
import { and, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contents, contentVersions } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { declareMassUnpublish } from '../builds/site-state.ts';
import { liveVersion } from '../content/contents.ts';
import { createRedirect } from '../content/redirects.ts';
import { recordPendingChange } from '../pending-changes/record.ts';

const refused = (code: string, message: string): Result<never> => ({
  ok: false,
  issues: [{ code, message, path: [] }],
});

/**
 * Tira o conteúdo do ar: a versão no ar (`liveVersion`) passa a `despublicado` e a mudança
 * pendente agenda o build, que deixa de trazê-lo. Com `to`, outro conteúdo no ar do site, o
 * caminho do despublicado ganha o 301 para o do destino, já sem cadeias (`createRedirect`
 * reaponta quem chegava nele); sem `to`, o endereço passa a responder 404. Trava a linha de
 * `contents`, como a publicação. Não grava em `publications`: não conta no limite diário e
 * não devolve a vaga do dia (ADR 0017).
 */
export async function unpublishContent(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  options: { to?: number } = {},
): Promise<Result<{ version: number; redirectId?: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const [content] = await tx
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)))
    .for('update');
  if (content === undefined) {
    return refused('content.not_found', `Conteúdo ${contentId} não encontrado no site ${siteId}`);
  }
  const live = await liveVersion(tx, siteId, contentId);
  if (live === undefined) {
    return refused('publication.not_live', `O conteúdo ${contentId} não está no ar`);
  }

  let target: { slug: string } | undefined;
  if (options.to !== undefined) {
    target = options.to === contentId ? undefined : await liveVersion(tx, siteId, options.to);
    if (target === undefined) {
      return refused(
        'publication.invalid_target',
        `O destino do 301 precisa ser outro conteúdo no ar do site ${siteId}: ${options.to} não é`,
      );
    }
  }

  let redirectId: number | undefined;
  if (target !== undefined) {
    const redirect = await createRedirect(
      tx,
      actor,
      siteId,
      { from: `/${live.slug}/`, to: `/${target.slug}/`, status: 301, origin: 'manual' },
      { action: 'content.publish' },
    );
    if (!redirect.ok) return redirect;
    redirectId = redirect.value.id;
  }

  await tx
    .update(contentVersions)
    .set({ status: 'despublicado' })
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, live.version),
      ),
    );
  await recordPendingChange(tx, siteId, 'content', String(contentId));
  return {
    ok: true,
    value:
      redirectId === undefined ? { version: live.version } : { version: live.version, redirectId },
  };
}

/** Interrompe o savepoint do lote quando um conteúdo é recusado. */
class BatchAborted extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super('Despublicação em lote interrompida');
    this.issues = issues;
  }
}

/**
 * Despublicação em massa (workspace#20, R7): tira do ar os conteúdos escolhidos, sem 301 (os
 * endereços passam a responder 404), e declara a despublicação em massa no site, para a trava
 * de segurança do próximo build não abortar a queda de páginas. Tudo num savepoint: se um
 * conteúdo for recusado, nada fica gravado e as issues voltam com o índice na lista.
 */
export async function unpublishContents(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentIds: readonly number[],
): Promise<Result<{ unpublished: { contentId: number; version: number }[]; declaredAt: Date }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;
  const ids = [...new Set(contentIds)];
  if (ids.length === 0) {
    return refused('publication.empty_batch', 'Escolha ao menos um conteúdo para despublicar');
  }

  try {
    return await tx.transaction(async (batch) => {
      const unpublished: { contentId: number; version: number }[] = [];
      for (const [index, contentId] of ids.entries()) {
        const result = await unpublishContent(batch, actor, siteId, contentId);
        if (!result.ok) {
          throw new BatchAborted(
            result.issues.map((issue) => ({
              ...issue,
              path: ['contentIds', index, ...issue.path],
            })),
          );
        }
        unpublished.push({ contentId, version: result.value.version });
      }
      const declaredAt = await declareMassUnpublish(batch, siteId, actor.email);
      return { ok: true as const, value: { unpublished, declaredAt } };
    });
  } catch (error) {
    if (error instanceof BatchAborted) return { ok: false, issues: error.issues };
    throw error;
  }
}
