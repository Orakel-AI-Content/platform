import { describe, expect, it } from 'vitest';

import { firstTarFile } from './tar.ts';

/** Monta um tar ustar com as entradas dadas (tipo, nome, conteúdo). */
function tar(entries: { type: string; name: string; content: string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const data = new TextEncoder().encode(entry.content);
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode(entry.name), 0);
    header.set(new TextEncoder().encode(data.length.toString(8).padStart(11, '0')), 124);
    header[156] = entry.type.charCodeAt(0);
    header.set(new TextEncoder().encode('ustar'), 257);
    blocks.push(header);
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    blocks.push(padded);
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

const text = (bytes: Uint8Array | undefined) =>
  bytes === undefined ? undefined : new TextDecoder().decode(bytes);

describe('firstTarFile', () => {
  it('devolve o conteúdo do primeiro arquivo regular', () => {
    expect(text(firstTarFile(tar([{ type: '0', name: 'result.json', content: '{"a":1}' }])))).toBe(
      '{"a":1}',
    );
  });

  it('pula o cabeçalho PAX que o Docker põe antes do arquivo', () => {
    const archive = tar([
      { type: 'x', name: 'PaxHeader', content: '30 mtime=1790000000.123456789\n'.repeat(30) },
      { type: '0', name: 'publish.json', content: 'conteúdo' },
    ]);
    expect(text(firstTarFile(archive))).toBe('conteúdo');
  });

  it('sem arquivo regular, undefined', () => {
    expect(firstTarFile(tar([{ type: '5', name: 'build/', content: '' }]))).toBeUndefined();
    expect(firstTarFile(new Uint8Array(0))).toBeUndefined();
  });
});
