import { absoluteUrl, contentPath } from '@orakel/core/v1';

import { getEnv } from '@/env.ts';

type Slugged = { slug: string };

/**
 * Prévia de um conteúdo no host de visualização (`PREVIEW_BASE_URL`, #110): a mesma do editor,
 * da revisão e do detalhe (#597).
 */
export function previewUrl(siteId: string, content: Slugged): string {
  return `${getEnv().PREVIEW_BASE_URL}/${siteId}${contentPath(content)}`;
}

/**
 * Endereço público de um conteúdo no domínio principal do site (`absoluteUrl`, a regra do
 * próprio site). `undefined` sem domínio: o resumo do site devolve `''` sem configuração.
 */
export function publicUrl(domain: string, content: Slugged): string | undefined {
  return domain === '' ? undefined : absoluteUrl({ domains: [domain] }, contentPath(content));
}
