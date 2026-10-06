import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { memoryStore } from '../../src/domain/media/store.ts';
import { receiveUpload } from '../../src/domain/media/upload.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
});

const editor: Actor = { email: 'editor@orakel.local', roles: ['editor'] };
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);

function send(siteId: string, store = memoryStore()) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(JPEG);
      controller.close();
    },
  });
  return receiveUpload({ db, store, newId: () => 'envio' }, editor, siteId, {
    contentLength: String(JPEG.byteLength),
    body,
  });
}

type IngestJob = { task_identifier: string; payload: unknown; max_attempts: number };

async function ingestJobs(): Promise<IngestJob[]> {
  // A view `jobs` não expõe o payload; a tabela privada sim. Criar o site agenda um build.
  const result = await db.execute(sql`
    select t.identifier as task_identifier, j.payload, j.max_attempts
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = 'ingest-media'`);
  return result.rows as IngestJob[];
}

describe('envio de imagem', () => {
  it('grava o envio cru e enfileira a ingestão no backoffice-worker', async () => {
    const store = memoryStore();
    const result = await send('exemplo-a', store);

    expect(result).toEqual({
      ok: true,
      value: { uploadKey: 'uploads/exemplo-a/envio.jpg', format: 'jpeg' },
    });
    expect(store.objects.get('media-originals/uploads/exemplo-a/envio.jpg')).toEqual(JPEG);
    expect(await ingestJobs()).toEqual([
      {
        task_identifier: 'ingest-media',
        payload: { siteId: 'exemplo-a', uploadKey: 'uploads/exemplo-a/envio.jpg' },
        max_attempts: 5,
      },
    ]);
  });

  it('site que não existe: recusa, sem gravar nem enfileirar', async () => {
    const store = memoryStore();
    const result = await send('nao-existe', store);
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
    expect(store.objects.size).toBe(0);
    expect(await ingestJobs()).toEqual([]);
  });
});
