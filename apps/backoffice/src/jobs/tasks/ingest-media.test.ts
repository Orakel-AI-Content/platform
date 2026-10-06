import type { JobHelpers } from 'graphile-worker';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { memoryStore, ORIGINALS_BUCKET } from '../../domain/media/store.ts';
import { createIngestMediaTask } from './ingest-media.ts';

function helpers() {
  const addJob = vi.fn<(task: string, payload: unknown, options: unknown) => Promise<void>>();
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { addJob, value: { addJob, logger } as unknown as JobHelpers };
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

    await createIngestMediaTask({ store })({ siteId: 'exemplo-a', uploadKey }, value);

    expect(addJob).toHaveBeenCalledOnce();
    const [task, payload, options] = addJob.mock.calls[0] ?? [];
    expect(task).toBe('media-variants');
    expect(payload).toMatchObject({ siteId: 'exemplo-a', width: 2560, height: 1280 });
    expect((payload as { originalKey: string }).originalKey).toMatch(
      /^exemplo-a\/[0-9a-f]{64}\.jpg$/,
    );
    expect(options).toEqual({ maxAttempts: 5 });
  });

  it('envio que não existe mais não encadeia nada', async () => {
    const { addJob, value } = helpers();
    await createIngestMediaTask({ store: memoryStore() })(
      { siteId: 'exemplo-a', uploadKey: 'uploads/exemplo-a/x.jpg' },
      value,
    );
    expect(addJob).not.toHaveBeenCalled();
  });
});
