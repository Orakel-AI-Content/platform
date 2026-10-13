import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UploadModule from '../../domain/media/upload.ts';

import type { Db } from '../../db/client.ts';
import { memoryStore } from '../../domain/media/store.ts';
import { createMediaVariantsTask } from './media-variants.ts';

// media-variants (#185): a chave do envio é opcional no payload (jobs antigos não a têm) e a
// última tentativa que falha fecha o envio como recusado. Gerar e registrar está no contrato.

const mocks = vi.hoisted(() => ({ registerMediaVariants: vi.fn(), closeUpload: vi.fn() }));
vi.mock('../../domain/media/variants.ts', () => ({
  registerMediaVariants: mocks.registerMediaVariants,
}));
vi.mock('../../domain/media/upload.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof UploadModule>()),
  closeUpload: mocks.closeUpload,
}));

const deps = { db: {} as Db, store: memoryStore() };
const base = { siteId: 'exemplo-a', originalKey: 'exemplo-a/abc.jpg', width: 800, height: 600 };

function helpers(attempts = 1, maxAttempts = 5) {
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { logger, job: { attempts, max_attempts: maxAttempts } } as unknown as JobHelpers;
}

beforeEach(() => {
  mocks.registerMediaVariants.mockReset();
  mocks.closeUpload.mockReset();
});

describe('media-variants', () => {
  it('payload antigo, sem a chave do envio, processa sem erro', async () => {
    mocks.registerMediaVariants.mockResolvedValue({
      status: 'registered',
      id: 3,
      variants: 2,
      written: 2,
    });

    await createMediaVariantsTask(deps)(base, helpers());

    expect(mocks.registerMediaVariants).toHaveBeenCalledWith(deps, base);
  });

  it('a chave do envio segue para o registro', async () => {
    mocks.registerMediaVariants.mockResolvedValue({ status: 'missing' });
    const payload = { ...base, uploadKey: 'uploads/exemplo-a/envio.jpg' };

    await createMediaVariantsTask(deps)(payload, helpers());

    expect(mocks.registerMediaVariants).toHaveBeenCalledWith(deps, payload);
  });

  it('chave do envio que não é texto é payload inválido', async () => {
    await expect(
      createMediaVariantsTask(deps)({ ...base, uploadKey: 7 }, helpers()),
    ).rejects.toThrow('Payload das variantes inválido');
  });

  it('falha na última tentativa fecha o envio como recusado e lança; antes, só lança', async () => {
    mocks.registerMediaVariants.mockRejectedValue(new Error('sharp falhou'));
    const payload = { ...base, uploadKey: 'uploads/exemplo-a/envio.jpg' };

    await expect(createMediaVariantsTask(deps)(payload, helpers(2, 5))).rejects.toThrow();
    expect(mocks.closeUpload).not.toHaveBeenCalled();

    await expect(createMediaVariantsTask(deps)(payload, helpers(5, 5))).rejects.toThrow();
    expect(mocks.closeUpload).toHaveBeenCalledWith(
      deps.db,
      { siteId: 'exemplo-a', uploadKey: 'uploads/exemplo-a/envio.jpg' },
      { status: 'recusada', reason: 'Falha no processamento' },
    );
  });
});
