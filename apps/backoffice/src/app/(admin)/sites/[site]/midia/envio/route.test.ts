import { beforeEach, describe, expect, it, vi } from 'vitest';

import { memoryStore } from '@/domain/media/store.ts';

import { POST } from './route.ts';

// A rota traduz as recusas do domínio para HTTP e repassa o corpo em streaming. O banco é
// um dublê mínimo (site existe, job enfileirado); o S3, o armazenamento em memória.

const mocks = vi.hoisted(() => ({ currentActor: vi.fn(), execute: vi.fn() }));
const store = memoryStore();

vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({
    db: {
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: 'exemplo-a' }]) }) }),
      execute: mocks.execute,
    },
  }),
}));
vi.mock('@/env.ts', () => ({ getEnv: () => ({}) }));
vi.mock('@/lib/s3.ts', () => ({
  createS3Client: () => ({}),
  s3ObjectStore: () => store,
}));

const editor = { email: 'editor@orakel.local', roles: ['editor'] };
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];

function jpeg(size: number): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(size);
  data.set(JPEG_HEAD);
  return data;
}

function upload(body: Uint8Array<ArrayBuffer> | null, headers: Record<string, string> = {}) {
  const request = new Request('http://backoffice/sites/exemplo-a/midia/envio', {
    method: 'POST',
    headers: {
      'content-type': 'image/jpeg',
      ...(body ? { 'content-length': String(body.byteLength) } : {}),
      ...headers,
    },
    body,
  });
  return POST(request, { params: Promise.resolve({ site: 'exemplo-a' }) });
}

beforeEach(() => {
  store.objects.clear();
  mocks.execute.mockReset();
  mocks.currentActor.mockResolvedValue({ ok: true, value: editor });
});

describe('envio de imagem', () => {
  it('sem sessão válida, 401', async () => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });
    expect((await upload(jpeg(100))).status).toBe(401);
  });

  it.each(['revisor', 'operacao'])('%s recebe 403, sem gravar nem enfileirar', async (role) => {
    mocks.currentActor.mockResolvedValue({ ok: true, value: { email: 'x@y', roles: [role] } });
    const response = await upload(jpeg(100));
    expect(response.status).toBe(403);
    expect(store.objects.size).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('arquivo que não é imagem: 415 com o motivo, sem gravar nada', async () => {
    const response = await upload(new TextEncoder().encode('não é uma imagem de verdade'));
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      title: 'O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
    });
    expect(store.objects.size).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('sem Content-Length: 411', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(jpeg(100));
        controller.close();
      },
    });
    const request = new Request('http://backoffice/sites/exemplo-a/midia/envio', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const response = await POST(request, { params: Promise.resolve({ site: 'exemplo-a' }) });
    expect(response.status).toBe(411);
  });

  it('acima de 25 MB: 413', async () => {
    const response = await upload(jpeg(100), { 'content-length': String(26 * 1024 * 1024) });
    expect(response.status).toBe(413);
    expect(store.objects.size).toBe(0);
  });

  it('uma imagem de 15 MB é gravada inteira e a ingestão enfileirada (202)', async () => {
    const size = 15 * 1024 * 1024;
    const response = await upload(jpeg(size));
    expect(response.status).toBe(202);
    const { uploadKey } = (await response.json()) as { uploadKey: string };
    expect(uploadKey).toMatch(/^uploads\/exemplo-a\/[0-9a-f-]{36}\.jpg$/);
    expect(store.objects.get(`media-originals/${uploadKey}`)?.byteLength).toBe(size);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
