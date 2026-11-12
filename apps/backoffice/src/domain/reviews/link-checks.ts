import type { Result } from '@orakel/content-model';
import type { Block, Inline } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contentLinkChecks, contentLinkResults, contentVersions } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';

// Links externos da revisão (#745): o envio para revisão enfileira um job que confere cada link
// `http(s)` dos blocos e grava o resultado por versão. Link fora do ar é aviso, nunca bloqueio.

export const LINK_CHECK_TASK = 'check-content-links';

/** Versão a conferir: o payload do job. */
export type LinkCheckTarget = { siteId: string; contentId: number; version: number };

/** Link externo de um bloco, pelo `n` estável do bloco. */
export type ExternalLink = { blockN: number; url: string };

/** Resultado de um link: respondeu, ou falhou com o motivo. */
export type LinkResult = ExternalLink & ({ ok: true } | { ok: false; reason: string });

/**
 * Estado da checagem para a tela: `nao_verificado` (versão enviada antes da checagem existir),
 * `verificando` (o job não terminou), `sem_links` ou `verificado` com o resultado por link.
 */
export type LinkCheckState =
  | { state: 'nao_verificado' }
  | { state: 'verificando' }
  | { state: 'sem_links' }
  | { state: 'verificado'; links: LinkResult[] };

/**
 * Registra a checagem pendente da versão e enfileira o job, na transação de quem leva a versão a
 * `em_revisao`. Reenvio da mesma versão (depois de uma devolução) volta a checagem a pendente e
 * troca o job pelo `job_key`, sem empilhar.
 */
export async function enqueueLinkCheck(tx: Executor, target: LinkCheckTarget): Promise<void> {
  await tx
    .insert(contentLinkChecks)
    .values(target)
    .onConflictDoUpdate({
      target: [contentLinkChecks.siteId, contentLinkChecks.contentId, contentLinkChecks.version],
      set: { requestedAt: sql`now()`, finishedAt: null },
    });
  const key = `content-links:${target.siteId}:${target.contentId}:${target.version}`;
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${LINK_CHECK_TASK},
      payload => ${JSON.stringify(target)}::json,
      max_attempts => 5,
      job_key => ${key},
      job_key_mode => 'replace'
    )`);
}

function isExternal(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://');
}

function inlineHrefs(inlines: readonly Inline[]): string[] {
  return inlines.flatMap((inline) => (inline.type === 'link' ? [inline.href] : []));
}

function blockHrefs(block: Block): string[] {
  switch (block.type) {
    case 'text':
      return block.content.flatMap((node) =>
        node.type === 'list' ? node.items.flatMap(inlineHrefs) : inlineHrefs(node.children),
      );
    case 'faq':
      return block.items.flatMap((item) => inlineHrefs(item.answer));
    case 'quote':
      return [
        ...inlineHrefs(block.content),
        ...(block.sourceUrl === undefined ? [] : [block.sourceUrl]),
      ];
    case 'image':
    case 'toc':
      return [];
  }
}

/**
 * Links externos (`http(s)` absolutos) dos blocos, na ordem do artigo e sem repetir o mesmo link
 * no mesmo bloco. Caminho do site (`/…`) é link interno e fica de fora.
 */
export function externalLinks(blocks: readonly Block[]): ExternalLink[] {
  return blocks.flatMap((block) =>
    [...new Set(blockHrefs(block).filter(isExternal))].map((url) => ({ blockN: block.n, url })),
  );
}

/** Links externos da versão; `undefined` se a versão não existe. */
export async function versionLinks(
  db: Executor,
  target: LinkCheckTarget,
): Promise<ExternalLink[] | undefined> {
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
  return row === undefined ? undefined : externalLinks(row.data.blocks);
}

/**
 * Grava o resultado da versão e conclui a checagem: troca os links anteriores pelos novos, então
 * rodar de novo não duplica. Chame dentro de uma transação.
 */
export async function recordLinkCheck(
  tx: Executor,
  target: LinkCheckTarget,
  results: readonly LinkResult[],
  finishedAt: Date,
): Promise<void> {
  const { siteId, contentId, version } = target;
  await tx
    .delete(contentLinkResults)
    .where(
      and(
        eq(contentLinkResults.siteId, siteId),
        eq(contentLinkResults.contentId, contentId),
        eq(contentLinkResults.version, version),
      ),
    );
  if (results.length > 0) {
    await tx.insert(contentLinkResults).values(
      results.map((result) => ({
        siteId,
        contentId,
        version,
        blockN: result.blockN,
        url: result.url,
        ok: result.ok,
        reason: result.ok ? null : result.reason,
      })),
    );
  }
  await tx
    .insert(contentLinkChecks)
    .values({ ...target, finishedAt })
    .onConflictDoUpdate({
      target: [contentLinkChecks.siteId, contentLinkChecks.contentId, contentLinkChecks.version],
      set: { finishedAt },
    });
}

/**
 * Estado da checagem de links da versão, para a revisão. Quem edita também lê (`site.read`).
 * O resultado volta na ordem dos blocos (`n`) e da URL.
 */
export async function linkCheckFor(
  db: Executor,
  actor: Actor,
  target: LinkCheckTarget,
): Promise<Result<LinkCheckState>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const { siteId, contentId, version } = target;
  const [check] = await db
    .select({ finishedAt: contentLinkChecks.finishedAt })
    .from(contentLinkChecks)
    .where(
      and(
        eq(contentLinkChecks.siteId, siteId),
        eq(contentLinkChecks.contentId, contentId),
        eq(contentLinkChecks.version, version),
      ),
    );
  if (check === undefined) return { ok: true, value: { state: 'nao_verificado' } };
  if (check.finishedAt === null) return { ok: true, value: { state: 'verificando' } };

  const rows = await db
    .select({
      blockN: contentLinkResults.blockN,
      url: contentLinkResults.url,
      ok: contentLinkResults.ok,
      reason: contentLinkResults.reason,
    })
    .from(contentLinkResults)
    .where(
      and(
        eq(contentLinkResults.siteId, siteId),
        eq(contentLinkResults.contentId, contentId),
        eq(contentLinkResults.version, version),
      ),
    )
    .orderBy(asc(contentLinkResults.blockN), asc(contentLinkResults.url));
  if (rows.length === 0) return { ok: true, value: { state: 'sem_links' } };
  return {
    ok: true,
    value: {
      state: 'verificado',
      links: rows.map(({ blockN, url, ok, reason }) =>
        ok ? { blockN, url, ok: true } : { blockN, url, ok: false, reason: reason ?? '' },
      ),
    },
  };
}
