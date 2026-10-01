// Leitura mínima de tar (ustar e PAX), só para o `GET /containers/{id}/archive` do Docker,
// que devolve o arquivo pedido dentro de um tar. Sem dependência: o build-runner só lê
// arquivos pequenos (result.json, publish.json).

const BLOCK = 512;

function field(header: Uint8Array, start: number, length: number): string {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end));
}

function octal(header: Uint8Array, start: number, length: number): number {
  const text = field(header, start, length).trim();
  return text === '' ? 0 : Number.parseInt(text, 8);
}

/** Conteúdo do primeiro arquivo regular do tar, ou `undefined` se não houver nenhum. */
export function firstTarFile(tar: Uint8Array): Uint8Array | undefined {
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) return undefined; // fim do arquivo
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] ?? 0);
    const dataStart = offset + BLOCK;
    // '0' ou NUL: arquivo regular. Os demais (PAX 'x'/'g', diretório…) são pulados.
    if (type === '0' || type === '\0') return tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return undefined;
}
