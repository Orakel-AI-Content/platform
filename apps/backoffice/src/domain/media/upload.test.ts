import { describe, expect, it } from 'vitest';

import type { Executor } from '../../db/client.ts';
import type { Actor } from '../access/rbac.ts';
import { detectImageFormat } from './formats.ts';
import { memoryStore } from './store.ts';
import { MAX_UPLOAD_BYTES, receiveUpload } from './upload.ts';

// As recusas vêm antes de abrir o banco e de gravar: o executor falha se for tocado.
const untouchableDb = new Proxy({} as Executor, {
  get() {
    throw new Error('o banco não devia ser consultado');
  },
});

const editor: Actor = { email: 'editor@exemplo.com', roles: ['editor'] };
const JPEG_HEAD = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

function bodyOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function send(
  actor: Actor,
  contentLength: string | null,
  ...chunks: Uint8Array[]
): Promise<{
  result: Awaited<ReturnType<typeof receiveUpload>>;
  store: ReturnType<typeof memoryStore>;
}> {
  return sendNamed(actor, encodeURIComponent('foto.jpg'), contentLength, ...chunks);
}

async function sendNamed(
  actor: Actor,
  fileName: string | null,
  contentLength: string | null,
  ...chunks: Uint8Array[]
) {
  const store = memoryStore();
  const result = await receiveUpload({ db: untouchableDb, store }, actor, 'exemplo-a', {
    contentLength,
    fileName,
    body: bodyOf(...chunks),
  });
  return { result, store };
}

describe('receiveUpload', () => {
  it.each(['revisor', 'operacao'] as const)('%s recebe recusa, sem gravar nada', async (role) => {
    const { result, store } = await send(
      { email: `${role}@exemplo.com`, roles: [role] },
      String(JPEG_HEAD.length),
      JPEG_HEAD,
    );
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(store.objects.size).toBe(0);
  });

  it('exige Content-Length', async () => {
    const { result } = await send(editor, null, JPEG_HEAD);
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'media.length_required' }] });
  });

  it('recusa acima do limite antes de ler o corpo', async () => {
    const { result } = await send(editor, String(MAX_UPLOAD_BYTES + 1), JPEG_HEAD);
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'media.too_large' }] });
  });

  it('recusa o que não é imagem com o motivo, sem gravar nada', async () => {
    const text = new TextEncoder().encode('isto não é uma imagem, é texto puro');
    const { result, store } = await send(editor, String(text.length), text);
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'media.unsupported_type' }] });
    expect(result.ok ? '' : result.issues[0]?.message).toContain('JPEG, PNG, WebP ou AVIF');
    expect(store.objects.size).toBe(0);
  });

  it('reconhece a assinatura mesmo partida em vários pedaços', async () => {
    const pieces = [JPEG_HEAD.subarray(0, 2), JPEG_HEAD.subarray(2, 5), JPEG_HEAD.subarray(5)];
    // Passa da checagem de formato e chega ao banco (siteExists).
    await expect(send(editor, String(JPEG_HEAD.length), ...pieces)).rejects.toThrow(
      'o banco não devia ser consultado',
    );
  });
});

describe('nome do arquivo (#184)', () => {
  it('sem o cabeçalho do nome, recusa sem ler o corpo nem gravar', async () => {
    const { result, store } = await sendNamed(editor, null, String(JPEG_HEAD.length), JPEG_HEAD);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'media.name_required' }] });
    expect(store.objects.size).toBe(0);
  });

  it.each([
    ['vazio', ''],
    ['só espaços', encodeURIComponent('   ')],
    ['maior que 255 caracteres', encodeURIComponent(`${'a'.repeat(252)}.jpg`)],
    ['com codificação quebrada', '%E0%A4%A'],
  ])('nome %s é recusado, sem gravar', async (_, fileName) => {
    const { result, store } = await sendNamed(
      editor,
      fileName,
      String(JPEG_HEAD.length),
      JPEG_HEAD,
    );

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'media.name_invalid' }] });
    expect(store.objects.size).toBe(0);
  });
});

describe('detectImageFormat', () => {
  const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

  it('reconhece JPEG, PNG, WebP e AVIF', () => {
    expect(detectImageFormat(JPEG_HEAD)).toBe('jpeg');
    expect(detectImageFormat(bytes('\x89PNG\r\n\x1a\n\0\0\0\r'))).toBe('png');
    expect(detectImageFormat(bytes('RIFF\0\0\0\0WEBP'))).toBe('webp');
    expect(detectImageFormat(bytes('\0\0\0\x1cftypavif'))).toBe('avif');
  });

  it('recusa GIF, SVG, HEIC e o que é curto demais', () => {
    expect(detectImageFormat(bytes('GIF89a\0\0\0\0\0\0'))).toBeUndefined();
    expect(detectImageFormat(bytes('<svg xmlns="h'))).toBeUndefined();
    expect(detectImageFormat(bytes('\0\0\0\x1cftypheic'))).toBeUndefined();
    expect(detectImageFormat(JPEG_HEAD.subarray(0, 3))).toBeUndefined();
  });
});
