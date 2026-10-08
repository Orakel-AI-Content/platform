import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { mediaUploads } from '../../src/db/schema/index.ts';
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

function send(
  siteId: string,
  store = memoryStore(),
  {
    fileName = encodeURIComponent('foto.jpg'),
    contentLength = String(JPEG.byteLength),
    bytes = JPEG,
  }: { fileName?: string | null; contentLength?: string; bytes?: Uint8Array } = {},
) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return receiveUpload({ db, store, newId: () => 'envio' }, editor, siteId, {
    contentLength,
    fileName,
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

const uploads = () => db.select().from(mediaUploads);

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

  it('registra o envio com o nome original, o site, a data e o estado processando (#184)', async () => {
    const before = new Date();
    const result = await send('exemplo-a', memoryStore(), {
      fileName: encodeURIComponent('Praia ação 01.jpg'),
    });

    expect(result.ok).toBe(true);
    const rows = await uploads();
    expect(rows.map((row) => ({ ...row, uploadedAt: row.uploadedAt instanceof Date }))).toEqual([
      {
        uploadKey: 'uploads/exemplo-a/envio.jpg',
        siteId: 'exemplo-a',
        originalName: 'Praia ação 01.jpg',
        status: 'processando',
        reason: null,
        mediaId: null,
        uploadedAt: true,
      },
    ]);
    expect(rows[0]?.uploadedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it.each([
    ['sem nome', { fileName: null }, 'media.name_required'],
    ['nome vazio', { fileName: '' }, 'media.name_invalid'],
    ['nome com mais de 255 caracteres', { fileName: 'a'.repeat(256) }, 'media.name_invalid'],
    ['tamanho acima do limite', { contentLength: String(26 * 1024 * 1024) }, 'media.too_large'],
    [
      'tipo que não é imagem',
      { bytes: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]) },
      'media.unsupported_type',
    ],
  ] as const)('%s: recusa sem registrar o envio', async (_, options, code) => {
    const store = memoryStore();
    const result = await send('exemplo-a', store, {
      ...options,
      ...('bytes' in options ? { contentLength: String(options.bytes.byteLength) } : {}),
    });

    expect(result).toMatchObject({ ok: false, issues: [{ code }] });
    expect(store.objects.size).toBe(0);
    expect(await uploads()).toEqual([]);
    expect(await ingestJobs()).toEqual([]);
  });

  it('site que não existe: recusa, sem gravar nem enfileirar', async () => {
    const store = memoryStore();
    const result = await send('nao-existe', store);
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
    expect(store.objects.size).toBe(0);
    expect(await ingestJobs()).toEqual([]);
    expect(
      await db.select().from(mediaUploads).where(eq(mediaUploads.siteId, 'nao-existe')),
    ).toEqual([]);
  });
});
