import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ListHeader } from '@/components/shared/PageHeader';
import { ReviewQueueTable } from '@/components/review/ReviewQueueTable';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import type { ReviewQueueEntry } from '@/domain/reviews/reviews.ts';

// Fila de revisão (#773): "Começar revisão" no cabeçalho leva ao primeiro item na ordem de
// `reviewQueue` (#772); com a fila vazia, não aparece. A seleção do lote só com content.publish
// (#776).

const queue = vi.hoisted(() => ({ items: [] as unknown[], roles: ['revisor'] as string[] }));

vi.mock('../editorial-page.tsx', () => ({
  sitePageContext: () =>
    Promise.resolve({
      ok: true,
      value: {
        actor: { email: 'pessoa@orakel.local', roles: queue.roles },
        db: {},
        site: { id: 'exemplo-a', name: 'Exemplo A', timeZone: 'UTC' },
      },
    }),
}));
vi.mock('./actions.ts', () => ({ approveBatchAction: vi.fn() }));
vi.mock('@/domain/reviews/reviews.ts', () => ({
  reviewQueue: () => Promise.resolve({ ok: true, value: queue.items }),
}));

const { default: ReviewQueuePage } = await import('./page.tsx');

const item = (id: number): ReviewQueueEntry => ({
  id,
  kind: 'article',
  title: `Artigo ${id}`,
  version: 1,
  submittedAt: new Date(0),
  pending: 0,
  links: { state: 'verificando' },
  returned: false,
  autoCorrected: false,
  opinion: 'favoravel',
  batchBlockers: ['a checagem de links externos não terminou'],
});

/** Primeiro elemento do tipo pedido na árvore devolvida pela página. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = find(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === type) return node as ReactElement<Record<string, unknown>>;
  return find(node.props.children, type);
}

async function headerAction(): Promise<ReactNode> {
  const page = await ReviewQueuePage({ params: Promise.resolve({ site: 'exemplo-a' }) });
  return find(page, ListHeader)?.props.action as ReactNode;
}

describe('página da fila de revisão', () => {
  beforeEach(() => {
    queue.items = [];
    queue.roles = ['revisor'];
  });

  it('com itens, "Começar revisão" leva ao primeiro da fila', async () => {
    queue.items = [item(7), item(3)];
    const action = find(await headerAction(), ButtonLink);
    expect(action?.props).toMatchObject({
      href: '/sites/exemplo-a/revisao/7',
      size: 'sm',
      children: 'Começar revisão',
    });
  });

  it('com a fila vazia, "Começar revisão" não aparece', async () => {
    expect(await headerAction()).toBeFalsy();
  });

  it('a fila seleciona para o lote só com content.publish', async () => {
    queue.items = [item(7)];
    const tableOf = async () =>
      find(
        await ReviewQueuePage({ params: Promise.resolve({ site: 'exemplo-a' }) }),
        ReviewQueueTable,
      )?.props;

    expect(await tableOf()).toMatchObject({ canPublish: true });
    queue.roles = ['editor'];
    expect(await tableOf()).toMatchObject({ canPublish: false });
  });
});
