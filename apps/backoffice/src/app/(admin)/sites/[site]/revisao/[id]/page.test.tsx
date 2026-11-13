import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentEditor } from '@/components/contents/ContentEditor';
import { ReviewPanel } from '@/components/review/ReviewPanel';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import type { Role } from '@/db/schema/index.ts';

// Tela de revisão (#767): com `content.amend` e a versão em revisão, o passo Ajustes recebe o
// editor no modo `amend`, ligado à versão vista e voltando à revisão em `?passo=ajustes`; a
// prévia continua ao lado. Sem a permissão, ou fora de revisão, nada de editor (nem as opções
// dele são lidas), e o "Corrigir" da rota provisória (#751) não existe mais.

const state = vi.hoisted(() => ({
  roles: ['revisor'] as Role[],
  status: 'em_revisao',
}));
const options = vi.hoisted(() => ({
  read: vi.fn(() =>
    Promise.resolve({ blockTypes: ['text'], media: {}, authors: [], taxonomies: [] }),
  ),
}));

const data = { kind: 'article', slug: 'guia', title: 'Guia', blocks: [] };

vi.mock('../../editorial-page.tsx', () => ({
  sitePageContext: () =>
    Promise.resolve({
      ok: true,
      value: {
        actor: { email: 'r@x', roles: state.roles },
        db: {},
        site: { id: 'exemplo-a', name: 'Exemplo A', timeZone: 'UTC' },
      },
    }),
}));
vi.mock('../../conteudos/content-versions.ts', () => ({
  readContentVersions: () =>
    Promise.resolve({
      actor: { email: 'r@x', roles: state.roles },
      timeZone: 'America/Sao_Paulo',
      site: { id: 'exemplo-a', name: 'Exemplo A', domain: '' },
      versions: { ok: true, value: [{ version: 2, status: state.status, data }] },
    }),
}));
vi.mock('../../conteudos/content-urls.ts', () => ({
  previewUrl: (siteId: string, value: { slug: string }) => `/previa/${siteId}/${value.slug}`,
}));
vi.mock('../../conteudos/editor-options.ts', () => ({ editorOptions: options.read }));
vi.mock('@/domain/reviews/reviews.ts', () => ({
  REVIEW_CHECKLIST: [],
  reviewChecks: () => Promise.resolve({ ok: true, value: { checks: [] } }),
}));
vi.mock('@/domain/reviews/link-checks.ts', () => ({
  linkCheckFor: () => Promise.resolve({ ok: true, value: undefined }),
}));
vi.mock('@/domain/reviews/confirmations.ts', () => ({
  reviewConfirmations: () => Promise.resolve({ ok: true, value: [] }),
}));
vi.mock('@/components/review/reviewCheckItems.ts', () => ({
  reviewCheckItems: () => [],
  hasError: () => false,
}));
vi.mock('../actions.ts', () => ({
  amendAction: vi.fn(),
  approveAction: vi.fn(),
  approvePublishAction: vi.fn(),
  approveScheduleAction: vi.fn(),
  confirmAction: vi.fn(),
  confirmAllAction: vi.fn(),
  returnAction: vi.fn(),
}));

const { default: ReviewPage } = await import('./page.tsx');

/** Elementos do tipo pedido na árvore devolvida pela página, na ordem. */
function findAll(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return (node as ReactNode[]).flatMap((child) => findAll(child, type));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const props = node.props;
  const nested = Object.values(props).flatMap((value) =>
    isValidElement(value) || Array.isArray(value) ? findAll(value as ReactNode, type) : [],
  );
  return node.type === type ? [node, ...nested] : nested;
}

const render = () =>
  ReviewPage({
    params: Promise.resolve({ site: 'exemplo-a', id: '7' }),
    searchParams: Promise.resolve({ passo: 'ajustes' }),
  });

describe('tela de revisão, passo Ajustes (#767)', () => {
  beforeEach(() => {
    state.roles = ['revisor'];
    state.status = 'em_revisao';
    options.read.mockClear();
  });

  it('com content.amend e a versão em revisão, o painel recebe o editor de correção', async () => {
    const page = await render();
    const panel = findAll(page, ReviewPanel)[0]!;
    expect(panel.props.step).toBe('ajustes');
    expect(panel.props.canAmend).toBe(true);
    const editor = findAll(panel.props.amend as ReactNode, ContentEditor)[0]!;
    expect(editor.props).toMatchObject({
      mode: 'amend',
      siteId: 'exemplo-a',
      backHref: '/sites/exemplo-a/revisao/7?passo=ajustes',
      timeZone: 'America/Sao_Paulo',
      defaultValues: data,
      previewUrl: '/previa/exemplo-a/guia',
    });
    // A prévia continua na tela, ao lado do painel.
    expect(findAll(page, 'iframe')).toHaveLength(1);
  });

  it('sem content.amend, nem editor nem leitura das opções', async () => {
    state.roles = ['editor'];
    const page = await render();
    const panel = findAll(page, ReviewPanel)[0]!;
    expect(panel.props.canAmend).toBe(false);
    expect(panel.props.amend).toBeFalsy();
    expect(options.read).not.toHaveBeenCalled();
  });

  it('com a versão fora de revisão, nem editor nem leitura das opções', async () => {
    state.status = 'aprovado';
    const page = await render();
    expect(findAll(page, ReviewPanel)[0]!.props.amend).toBeFalsy();
    expect(options.read).not.toHaveBeenCalled();
  });

  it('o "Corrigir" da rota provisória não existe mais', async () => {
    const page = await render();
    expect(findAll(page, ButtonLink)).toHaveLength(0);
  });
});
