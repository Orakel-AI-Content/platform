import { RESOURCES } from '@orakel/content-model/v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Executor } from '@/db/client.ts';

import { contentReferences, editorOptions, mediaSource } from './editor-options.ts';

// Os tipos de bloco oferecidos vêm dos recursos da release do site (`resourcesFor`).

const mocks = vi.hoisted(() => ({
  resourcesFor: vi.fn(),
  listMedia: vi.fn(),
  listMediaPageAction: vi.fn(),
  mediaByIdsAction: vi.fn(),
  listAuthors: vi.fn(),
  listTaxonomies: vi.fn(),
}));

vi.mock('@/domain/sites/sites.ts', () => ({ resourcesFor: mocks.resourcesFor }));
vi.mock('@/domain/content/media.ts', () => ({ listMedia: mocks.listMedia }));
vi.mock('../midia/actions.ts', () => ({
  listMediaPageAction: mocks.listMediaPageAction,
  mediaByIdsAction: mocks.mediaByIdsAction,
}));
vi.mock('@/domain/content/authors.ts', () => ({ listAuthors: mocks.listAuthors }));
vi.mock('@/domain/content/taxonomies.ts', () => ({ listTaxonomies: mocks.listTaxonomies }));

const db = {} as Executor;
const editor = { email: 'editor@orakel.local', roles: ['editor' as const] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAuthors.mockResolvedValue({ ok: true, value: [] });
  mocks.listTaxonomies.mockResolvedValue({ ok: true, value: [] });
});

describe('opções do editor de conteúdo', () => {
  it('oferece os tipos de bloco dos recursos da release do site', async () => {
    mocks.resourcesFor.mockResolvedValue(RESOURCES);

    const options = await editorOptions(db, editor, 'exemplo-a');

    expect(options?.blockTypes).toEqual(RESOURCES.blockTypes);
    expect(mocks.resourcesFor).toHaveBeenCalledWith(db, 'exemplo-a');
  });

  it('com recursos sem o bloco faq, deixa de oferecer o faq', async () => {
    mocks.resourcesFor.mockResolvedValue({
      ...RESOURCES,
      blockTypes: RESOURCES.blockTypes.filter((t) => t !== 'faq'),
    });

    const options = await editorOptions(db, editor, 'exemplo-a');

    expect(RESOURCES.blockTypes).toContain('faq');
    expect(options?.blockTypes).not.toContain('faq');
    expect(options?.blockTypes).toHaveLength(RESOURCES.blockTypes.length - 1);
  });

  it('não carrega a biblioteca de mídia: a grade lê por página (#182)', async () => {
    mocks.resourcesFor.mockResolvedValue(RESOURCES);

    const options = await editorOptions(db, editor, 'exemplo-a');

    expect(mocks.listMedia).not.toHaveBeenCalled();
    expect(options?.media).toBeDefined();
  });

  it('a biblioteca do campo de mídia chama as actions com o site', async () => {
    const source = mediaSource('exemplo-a');

    await source.load(3);
    await source.byIds([7, 9]);

    expect(mocks.listMediaPageAction).toHaveBeenCalledWith('exemplo-a', 3);
    expect(mocks.mediaByIdsAction).toHaveBeenCalledWith('exemplo-a', [7, 9]);
  });
});

describe('referências do conteúdo (#593)', () => {
  const refused = { ok: false, issues: [{ code: 'auth.forbidden', message: 'x', path: [] }] };

  it('rotula autores pelo nome e taxonomias com o tipo, como no editor', async () => {
    mocks.resourcesFor.mockResolvedValue(RESOURCES);
    mocks.listAuthors.mockResolvedValue({
      ok: true,
      value: [{ id: 1, slug: 'ana', name: 'Ana Souza' }],
    });
    mocks.listTaxonomies.mockResolvedValue({
      ok: true,
      value: [
        { id: 6, kind: 'category', slug: 'hortas', name: 'Hortas' },
        { id: 7, kind: 'tag', slug: 'vaso', name: 'Vaso' },
        { id: 13, kind: 'series', slug: 'comecar', name: 'Começar' },
      ],
    });

    const references = await contentReferences(db, editor, 'exemplo-a');

    expect(references).toEqual({
      authors: [{ id: 1, label: 'Ana Souza' }],
      taxonomies: [
        { id: 6, label: 'Hortas (categoria)' },
        { id: 7, label: 'Vaso (tag)' },
        { id: 13, label: 'Começar (série)' },
      ],
    });
    const options = await editorOptions(db, editor, 'exemplo-a');
    expect(options?.authors).toEqual(references?.authors);
    expect(options?.taxonomies).toEqual(references?.taxonomies);
  });

  it.each(['listAuthors', 'listTaxonomies'] as const)(
    'com %s recusada, não devolve referências nem opções',
    async (read) => {
      mocks.resourcesFor.mockResolvedValue(RESOURCES);
      mocks[read].mockResolvedValue(refused);

      expect(await contentReferences(db, editor, 'exemplo-a')).toBeUndefined();
      expect(await editorOptions(db, editor, 'exemplo-a')).toBeUndefined();
    },
  );
});
