import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import {
  recordLinkCheck,
  versionLinks,
  type ExternalLink,
  type LinkCheckTarget,
  type LinkResult,
} from '../../domain/reviews/link-checks.ts';

export type CheckContentLinksTaskDeps = {
  db: Db;
  /** `fetch` do runtime; falso nos testes, que não usam rede. */
  fetch?: typeof fetch;
  /** Tempo de espera por link, em milissegundos. */
  timeoutMs?: number;
  now?: () => Date;
};

export const LINK_TIMEOUT_MS = 10_000;
/** Links conferidos ao mesmo tempo, para não martelar um domínio. */
export const LINK_CONCURRENCY = 4;

function targetOf(payload: unknown): LinkCheckTarget {
  const { siteId, contentId, version } = (payload ?? {}) as Partial<
    Record<keyof LinkCheckTarget, unknown>
  >;
  const positive = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) > 0;
  if (typeof siteId !== 'string' || siteId === '' || !positive(contentId) || !positive(version)) {
    throw new Error(`Payload da checagem de links inválido: ${JSON.stringify(payload)}`);
  }
  return { siteId, contentId, version };
}

function failureReason(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `Sem resposta em ${timeoutMs / 1000} s`;
  }
  const cause =
    error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  const detail =
    typeof cause?.code === 'string' ? cause.code : error instanceof Error ? error.message : '';
  return detail === '' ? 'Erro de rede' : `Erro de rede: ${detail}`;
}

/**
 * Confere um link: `HEAD` seguindo redirecionamentos, repetido com `GET` quando o servidor não
 * aceita `HEAD` (405 ou 501). Respondeu = status abaixo de 400; o resto é falha com o motivo.
 */
async function checkLink(
  doFetch: typeof fetch,
  link: ExternalLink,
  timeoutMs: number,
): Promise<LinkResult> {
  const request = async (method: 'HEAD' | 'GET') => {
    const response = await doFetch(link.url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return response;
  };
  try {
    let response = await request('HEAD');
    if (response.status === 405 || response.status === 501) response = await request('GET');
    return response.status < 400
      ? { ...link, ok: true }
      : { ...link, ok: false, reason: `HTTP ${response.status}` };
  } catch (error) {
    return { ...link, ok: false, reason: failureReason(error, timeoutMs) };
  }
}

/** Confere os links com no máximo `LINK_CONCURRENCY` ao mesmo tempo, mantendo a ordem. */
async function checkAll(
  doFetch: typeof fetch,
  links: readonly ExternalLink[],
  timeoutMs: number,
): Promise<LinkResult[]> {
  const results: LinkResult[] = new Array<LinkResult>(links.length);
  let next = 0;
  const lane = async () => {
    while (next < links.length) {
      const i = next++;
      const link = links[i];
      if (link !== undefined) results[i] = await checkLink(doFetch, link, timeoutMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LINK_CONCURRENCY, links.length) }, lane));
  return results;
}

/**
 * Checagem dos links externos de uma versão em revisão (#745): confere cada link fora de
 * transação e grava o resultado numa transação só, trocando o anterior. Link que falha é
 * resultado, não erro; o job só lança em erro de banco, e o Graphile repete. Versão que não
 * existe mais é pulada.
 */
export function createCheckContentLinksTask(deps: CheckContentLinksTaskDeps): Task {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? LINK_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date());
  return async (payload, helpers) => {
    const target = targetOf(payload);
    const links = await versionLinks(deps.db, target);
    if (links === undefined) {
      helpers.logger.warn(
        `checagem de links pulada: versão ${target.version} do conteúdo ${target.contentId} ` +
          `não existe em ${target.siteId}`,
      );
      return;
    }
    const results = await checkAll(doFetch, links, timeoutMs);
    await deps.db.transaction((tx) => recordLinkCheck(tx, target, results, now()));
    const failed = results.filter((result) => !result.ok).length;
    helpers.logger.info(
      `links de ${target.siteId}/${target.contentId} v${target.version}: ` +
        `${results.length} conferidos, ${failed} com falha`,
    );
  };
}
