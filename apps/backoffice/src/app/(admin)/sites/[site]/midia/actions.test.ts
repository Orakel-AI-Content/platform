import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listMediaPageAction, mediaByIdsAction, uploadStatusAction } from './actions.ts';
import { MEDIA_PAGE_SIZE } from './items.ts';

// Actions da grade de mídia (#180): só traduzem. Sessão ou recusa do domínio → null; sucesso →
// itens com a miniatura no domínio principal do site. Regras e permissão estão no contrato.

const mocks = vi.hoisted(() => ({
  getUploads: vi.fn(),
  currentActor: vi.fn(),
  listMediaPage: vi.fn(),
  getMediaByIds: vi.fn(),
  currentConfig: vi.fn(),
}));

vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({ getDb: () => ({ db: {} }) }));
vi.mock('@/domain/content/media.ts', () => ({
  listMedia: vi.fn(),
  listMediaPage: mocks.listMediaPage,
  getMediaByIds: mocks.getMediaByIds,
}));
vi.mock('@/domain/sites/sites.ts', () => ({ currentConfig: mocks.currentConfig }));
vi.mock('@/domain/media/upload.ts', () => ({ getUploads: mocks.getUploads }));

const revisor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const forbidden = {
  ok: false,
  issues: [{ code: 'forbidden', message: 'Sem permissão para site.read', path: [] }],
};
const photo = {
  id: 7,
  width: 800,
  height: 600,
  variants: [{ width: 400, format: 'webp', path: '/media/7-400.webp' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: revisor });
  mocks.currentConfig.mockResolvedValue({ domains: ['exemplo-a.com.br'] });
});

describe('listMediaPageAction', () => {
  it('pede a página com o tamanho fixo e devolve itens com miniatura e o total', async () => {
    mocks.listMediaPage.mockResolvedValue({ ok: true, value: { items: [photo], total: 31 } });

    const result = await listMediaPageAction('exemplo-a', 2);

    expect(mocks.listMediaPage).toHaveBeenCalledWith({}, revisor, 'exemplo-a', {
      page: 2,
      pageSize: MEDIA_PAGE_SIZE,
      search: '',
    });
    expect(result).toMatchObject({ total: 31, page: 2, pageSize: MEDIA_PAGE_SIZE });
    expect(result?.items.map((item) => item.id)).toEqual([7]);
    expect(result?.items[0]?.src).toContain('exemplo-a.com.br');
  });

  it('sem sessão ou sem site.read, null', async () => {
    mocks.listMediaPage.mockResolvedValue(forbidden);
    expect(await listMediaPageAction('exemplo-a', 1)).toBeNull();

    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    expect(await listMediaPageAction('exemplo-a', 1)).toBeNull();
  });
});

describe('listMediaPageAction com busca e nome (#186)', () => {
  it('repassa a busca e devolve nome e data do envio (a data em ISO)', async () => {
    const at = new Date('2026-10-01T15:30:00Z');
    mocks.listMediaPage.mockResolvedValue({
      ok: true,
      value: { items: [{ ...photo, originalName: 'Praia.jpg', uploadedAt: at }], total: 1 },
    });

    const result = await listMediaPageAction('exemplo-a', 1, 'praia');

    expect(mocks.listMediaPage).toHaveBeenCalledWith({}, revisor, 'exemplo-a', {
      page: 1,
      pageSize: MEDIA_PAGE_SIZE,
      search: 'praia',
    });
    expect(result?.items[0]).toMatchObject({
      originalName: 'Praia.jpg',
      uploadedAt: '2026-10-01T15:30:00.000Z',
    });
  });
});

describe('mediaByIdsAction', () => {
  it('devolve as mídias encontradas com miniatura', async () => {
    mocks.getMediaByIds.mockResolvedValue({ ok: true, value: [photo] });

    const result = await mediaByIdsAction('exemplo-a', [7, 999]);

    expect(mocks.getMediaByIds).toHaveBeenCalledWith({}, revisor, 'exemplo-a', [7, 999]);
    expect(result?.map((item) => item.id)).toEqual([7]);
  });

  it('sem sessão ou sem site.read, null', async () => {
    mocks.getMediaByIds.mockResolvedValue(forbidden);
    expect(await mediaByIdsAction('exemplo-a', [7])).toBeNull();

    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    expect(await mediaByIdsAction('exemplo-a', [7])).toBeNull();
  });
});

describe('uploadStatusAction (#188)', () => {
  it('devolve o estado dos envios pelas chaves, do site pedido', async () => {
    const states = [
      { uploadKey: 'uploads/exemplo-a/a.jpg', status: 'pronta', reason: null, mediaId: 7 },
    ];
    mocks.getUploads.mockResolvedValue({ ok: true, value: states });

    expect(await uploadStatusAction('exemplo-a', ['uploads/exemplo-a/a.jpg'])).toEqual(states);
    expect(mocks.getUploads).toHaveBeenCalledWith({}, revisor, 'exemplo-a', [
      'uploads/exemplo-a/a.jpg',
    ]);
  });

  it('sem sessão ou sem site.read, null', async () => {
    mocks.getUploads.mockResolvedValue(forbidden);
    expect(await uploadStatusAction('exemplo-a', ['x'])).toBeNull();

    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    expect(await uploadStatusAction('exemplo-a', ['x'])).toBeNull();
  });
});
