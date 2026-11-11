import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Executor } from '@/db/client.ts';
import type { ContentData } from '@/db/schema/index.ts';

import { readVersionReferences, referenceLabels, versionMediaIds } from './version-references.ts';

// Nomes e miniaturas da leitura de uma versão (#593): as leituras do editor, mídias em lotes.

const mocks = vi.hoisted(() => ({ contentReferences: vi.fn(), mediaByIdsAction: vi.fn() }));

vi.mock('./editor-options.ts', () => ({ contentReferences: mocks.contentReferences }));
vi.mock('../midia/actions.ts', () => ({ mediaByIdsAction: mocks.mediaByIdsAction }));
vi.mock('@/domain/content/media.ts', () => ({ MAX_MEDIA_PAGE_SIZE: 2 }));

const db = {} as Executor;
const actor = { email: 'revisor@orakel.local', roles: ['revisor' as const] };

const data: ContentData = {
  kind: 'article',
  slug: 'guia',
  title: 'Guia',
  authorIds: [1],
  taxonomyIds: [6],
  coverMediaId: 3,
  publishedAt: '2026-10-01T12:00:00Z',
  blocks: [
    { n: 1, type: 'image', mediaId: 9, alt: 'Uma' },
    { n: 2, type: 'toc' },
    { n: 3, type: 'image', mediaId: 3, alt: 'A capa de novo' },
    { n: 4, type: 'image', mediaId: 11, alt: 'Outra' },
  ],
};

const item = (id: number) => ({ id, width: 10, height: 10, sources: [], src: `${id}.jpg` });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contentReferences.mockResolvedValue({
    authors: [{ id: 1, label: 'Ana Souza' }],
    taxonomies: [{ id: 6, label: 'Hortas (categoria)' }],
  });
  mocks.mediaByIdsAction.mockImplementation((_site: string, ids: number[]) =>
    Promise.resolve(ids.filter((id) => id !== 11).map(item)),
  );
});

describe('referências da leitura de uma versão', () => {
  it('junta a capa e as imagens dos blocos, sem repetir', () => {
    expect(versionMediaIds(data)).toEqual([3, 9, 11]);
    expect(versionMediaIds({ ...data, coverMediaId: undefined, blocks: [] })).toEqual([]);
  });

  it('resolve nomes e mídias por ID, lendo as mídias em lotes do limite', async () => {
    const references = await readVersionReferences(db, actor, 'exemplo-a', data);

    expect(mocks.contentReferences).toHaveBeenCalledWith(db, actor, 'exemplo-a');
    expect(mocks.mediaByIdsAction.mock.calls).toEqual([
      ['exemplo-a', [3, 9]],
      ['exemplo-a', [11]],
    ]);
    expect(references?.authors.get(1)).toBe('Ana Souza');
    expect(references?.taxonomies.get(6)).toBe('Hortas (categoria)');
    expect([...(references?.media.keys() ?? [])]).toEqual([3, 9]);
  });

  it('sem mídia na versão, não lê mídias', async () => {
    await readVersionReferences(db, actor, 'exemplo-a', {
      ...data,
      coverMediaId: undefined,
      blocks: [],
    });

    expect(mocks.mediaByIdsAction).not.toHaveBeenCalled();
  });

  it('com a leitura de autores e taxonomias recusada, não devolve referências', async () => {
    mocks.contentReferences.mockResolvedValue(undefined);

    expect(await readVersionReferences(db, actor, 'exemplo-a', data)).toBeUndefined();
  });

  it('com a leitura de mídias recusada, não devolve referências', async () => {
    mocks.mediaByIdsAction.mockResolvedValue(null);

    expect(await readVersionReferences(db, actor, 'exemplo-a', data)).toBeUndefined();
  });
});

describe('rótulos das referências por ID', () => {
  it('autores e taxonomias em mapas de ID para rótulo, como o resumo do conteúdo lê (#597)', () => {
    const labels = referenceLabels({
      authors: [{ id: 1, label: 'Ana Souza' }],
      taxonomies: [{ id: 6, label: 'Hortas (categoria)' }],
    });

    expect([...labels.authors]).toEqual([[1, 'Ana Souza']]);
    expect([...labels.taxonomies]).toEqual([[6, 'Hortas (categoria)']]);
  });
});
