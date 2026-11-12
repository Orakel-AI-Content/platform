import type { Block } from '@orakel/content-model/v1';

import { CONTENT_META_LABELS } from '@/components/contents/contentLabels.ts';
import type { ReviewCheck } from '@/domain/reviews/checks.ts';
import type { LinkCheckState } from '@/domain/reviews/link-checks.ts';

// Itens da seção de checagens automáticas da revisão (workspace#87), já prontos para a tela:
// as checagens calculadas na leitura (`reviewChecks`) e, logo depois dos links internos, a dos
// links externos (`linkCheckFor`, gravada pelo job). Cada pendência leva a mensagem e onde está:
// "Bloco N" (a numeração do editor) ou o rótulo do campo no editor. Roda no servidor; o
// componente recebe só dados serializáveis.

/** Estado do item na tela: o nível da checagem, ou o do job dos links externos. */
export type ReviewCheckItemState = 'ok' | 'aviso' | 'erro' | 'verificando' | 'nao_verificado';

/** Pendência do item: o que está errado e onde (vazio quando é o conteúdo todo). */
export type ReviewCheckItemFinding = { message: string; where: string };

export type ReviewCheckItem = {
  key: string;
  label: string;
  state: ReviewCheckItemState;
  findings: ReviewCheckItemFinding[];
};

export const EXTERNAL_LINKS_LABEL = 'Links externos respondem';

const blockWhere = (position: number) => `Bloco ${position}`;

/** Onde está o problema, pelo `path` da issue: bloco pela posição, campo pelo rótulo do editor. */
export function findingWhere(path: readonly PropertyKey[]): string {
  const [root, second] = path;
  if (root === 'blocks' && typeof second === 'number') return blockWhere(second + 1);
  if (typeof root !== 'string') return '';
  const nested = typeof second === 'string' ? CONTENT_META_LABELS[`${root}.${second}`] : undefined;
  return nested ?? CONTENT_META_LABELS[root] ?? root;
}

function externalLinksItem(
  links: LinkCheckState,
  blocks: readonly Pick<Block, 'n'>[],
): ReviewCheckItem {
  const base = { key: 'links_externos', label: EXTERNAL_LINKS_LABEL };
  switch (links.state) {
    case 'nao_verificado':
    case 'verificando':
      return { ...base, state: links.state, findings: [] };
    case 'sem_links':
      return { ...base, state: 'ok', findings: [] };
    case 'verificado': {
      const findings = links.links.flatMap((link) => {
        if (link.ok) return [];
        const index = blocks.findIndex((block) => block.n === link.blockN);
        return [
          {
            message: `O link ${link.url} não respondeu: ${link.reason}`,
            where: index === -1 ? '' : blockWhere(index + 1),
          },
        ];
      });
      return { ...base, state: findings.length === 0 ? 'ok' : 'aviso', findings };
    }
  }
}

/**
 * Itens da seção, na ordem de `REVIEW_CHECKS` com os links externos depois dos internos.
 * `blocks` são os da versão revisada, para achar a posição do bloco pelo `n` do link.
 */
export function reviewCheckItems(
  checks: readonly ReviewCheck[],
  links: LinkCheckState,
  blocks: readonly Pick<Block, 'n'>[],
): ReviewCheckItem[] {
  return checks.flatMap((check) => {
    const item: ReviewCheckItem = {
      key: check.key,
      label: check.label,
      state: check.level,
      findings: check.findings.map(({ message, path }) => ({
        message,
        where: findingWhere(path),
      })),
    };
    return check.key === 'links_internos' ? [item, externalLinksItem(links, blocks)] : [item];
  });
}

/** Algum item com `erro`: é o que barra "Aprovar" (a validação da release, como no domínio). */
export const hasError = (items: readonly ReviewCheckItem[]) =>
  items.some((item) => item.state === 'erro');
