import type { JobHelpers } from 'graphile-worker';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UploadModule from '../../domain/media/upload.ts';

import type { Executor } from '../../db/client.ts';
import { memoryStore, ORIGINALS_BUCKET } from '../../domain/media/store.ts';
import { createIngestMediaTask } from './ingest-media.ts';

// O fechamento do envio (#185) é espionado; o banco de verdade fica no contrato.
const mocks = vi.hoisted(() => ({ closeUpload: vi.fn() }));
vi.mock('../../domain/media/upload.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof UploadModule>()),
  closeUpload: mocks.closeUpload,
}));

const db = {} as Executor;

beforeEach(() => {
  mocks.closeUpload.mockReset();
});

function helpers(attempts = 1, maxAttempts = 5) {
  const addJob = vi.fn<(task: string, payload: unknown, options: unknown) => Promise<void>>();
  const logger = { info: vi.fn(), warn: vi.fn() };
  const job = { attempts, max_attempts: maxAttempts };
  return { addJob, value: { addJob, logger, job } as unknown as JobHelpers };
}

describe('ingest-media', () => {
  it('encadeia as variantes com o original e as dimensões dele', async () => {
    const store = memoryStore();
    const raw = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#000' },
    })
      .jpeg()
      .toBuffer();
    const uploadKey = 'uploads/exemplo-a/envio.jpg';
    await store.put(ORIGINALS_BUCKET, uploadKey, raw, raw.byteLength, 'image/jpeg');
    const { addJob, value } = helpers();

    await createIngestMediaTask({ db, store })({ siteId: 'exemplo-a', uploadKey }, value);

    expect(addJob).toHaveBeenCalledOnce();
    const [task, payload, options] = addJob.mock.calls[0] ?? [];
    expect(task).toBe('media-variants');
    expect(payload).toMatchObject({ siteId: 'exemplo-a', width: 2560, height: 1280, uploadKey });
    expect((payload as { originalKey: string }).originalKey).toMatch(
      /^exemplo-a\/[0-9a-f]{64}\.jpg$/,
    );
    expect(options).toEqual({ maxAttempts: 5 });
  });

  it('envio que não existe mais não encadeia nada', async () => {
    const { addJob, value } = helpers();
    await createIngestMediaTask({ db, store: memoryStore() })(
      { siteId: 'exemplo-a', uploadKey: 'uploads/exemplo-a/x.jpg' },
      value,
    );
    expect(addJob).not.toHaveBeenCalled();
  });

  it('arquivo corrompido fecha o envio como recusado, sem lançar nem encadear (#185)', async () => {
    const store = memoryStore();
    const uploadKey = 'uploads/exemplo-a/quebrada.jpg';
    const raw = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
      Buffer.alloc(100, 1),
    ]);
    await store.put(ORIGINALS_BUCKET, uploadKey, raw, raw.byteLength, 'image/jpeg');
    const { addJob, value } = helpers();

    await createIngestMediaTask({ db, store })({ siteId: 'exemplo-a', uploadKey }, value);

    expect(addJob).not.toHaveBeenCalled();
    expect(mocks.closeUpload).toHaveBeenCalledWith(
      db,
      { siteId: 'exemplo-a', uploadKey },
      { status: 'recusada', reason: 'A imagem está corrompida ou não pôde ser lida' },
    );
  });

  it('falha na última tentativa fecha o envio com "Falha no processamento" e lança', async () => {
    const store = memoryStore();
    store.get = () => Promise.reject(new Error('S3 fora do ar'));
    const input = { siteId: 'exemplo-a', uploadKey: 'uploads/exemplo-a/x.jpg' };

    await expect(createIngestMediaTask({ db, store })(input, helpers(5, 5).value)).rejects.toThrow(
      'S3 fora do ar',
    );
    expect(mocks.closeUpload).toHaveBeenCalledWith(db, input, {
      status: 'recusada',
      reason: 'Falha no processamento',
    });
  });

  it('falha antes da última tentativa lança sem fechar o envio (o worker repete)', async () => {
    const store = memoryStore();
    store.get = () => Promise.reject(new Error('S3 fora do ar'));

    await expect(
      createIngestMediaTask({ db, store })(
        { siteId: 'exemplo-a', uploadKey: 'uploads/exemplo-a/x.jpg' },
        helpers(2, 5).value,
      ),
    ).rejects.toThrow('S3 fora do ar');
    expect(mocks.closeUpload).not.toHaveBeenCalled();
  });
});
