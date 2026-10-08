import { RESOURCES } from '@orakel/content-model/v1';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Executor } from '@/db/client.ts';

import { editorOptions, mediaSource } from './editor-options.ts';

// Os tipos de bloco oferecidos vêm dos recursos da release do site (`resourcesFor`).

const mocks = vi.hoisted(() => ({
  resourcesFor: vi.fn(),
  listMedia: vi.fn(),
  listMediaPageAction: vi.fn(),
  mediaByIdsAction: vi.fn(),
}));

vi.mock('@/domain/sites/sites.ts', () => ({ resourcesFor: mocks.resourcesFor }));
vi.mock('@/domain/content/media.ts', () => ({ listMedia: mocks.listMedia }));
vi.mock('../midia/actions.ts', () => ({
  listMediaPageAction: mocks.listMediaPageAction,
  mediaByIdsAction: mocks.mediaByIdsAction,
}));
vi.mock('@/domain/content/authors.ts', () => ({ listAuthors: () => ({ ok: true, value: [] }) }));
vi.mock('@/domain/content/taxonomies.ts', () => ({
  listTaxonomies: () => ({ ok: true, value: [] }),
}));

const db = {} as Executor;
const editor = { email: 'editor@orakel.local', roles: ['editor' as const] };

beforeEach(() => {
  vi.clearAllMocks();
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
