import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../db/client.ts';
import { restoreSiteMedia } from '../../domain/media/reprocess.ts';
import { memoryStore } from '../../domain/media/store.ts';
import { createRestoreSiteMediaTask } from './restore-site-media.ts';

vi.mock('../../domain/media/reprocess.ts', () => ({ restoreSiteMedia: vi.fn() }));

const restore = vi.mocked(restoreSiteMedia);
const deps = { db: {} as Db, store: memoryStore() };
const helpers = (info = vi.fn(), warn = vi.fn()) =>
  ({ logger: { info, warn } }) as unknown as JobHelpers;

beforeEach(() => {
  restore.mockReset();
});

describe('restore-site-media', () => {
  it('regrava o site do payload e registra o relatório no log', async () => {
    restore.mockImplementation((d) => {
      d.warn?.('mídia 1 de exemplo-a sem original guardado');
      return Promise.resolve({ restored: [3], withoutOriginal: [1], written: 10 });
    });
    const info = vi.fn();
    const warn = vi.fn();

    await createRestoreSiteMediaTask(deps)({ siteId: 'exemplo-a' }, helpers(info, warn));

    expect(restore).toHaveBeenCalledWith(expect.objectContaining(deps), 'exemplo-a');
    expect(warn).toHaveBeenCalledWith('mídia 1 de exemplo-a sem original guardado');
    expect(info).toHaveBeenCalledWith(
      'regravação de exemplo-a: 1 mídias regravadas, 10 arquivos gravados, 1 sem original',
    );
  });

  it.each([null, {}, { siteId: '' }, { siteId: 7 }])('recusa o payload %j', async (payload) => {
    await expect(createRestoreSiteMediaTask(deps)(payload, helpers())).rejects.toThrow(
      'Payload da regravação sem siteId',
    );
    expect(restore).not.toHaveBeenCalled();
  });

  it('falha do armazenamento lança, para o Graphile repetir', async () => {
    restore.mockRejectedValue(new Error('S3 fora'));
    await expect(
      createRestoreSiteMediaTask(deps)({ siteId: 'exemplo-a' }, helpers()),
    ).rejects.toThrow('S3 fora');
  });
});
