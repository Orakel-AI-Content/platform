// Servidor HTTP local para os testes: serve NDJSON em pedaços, como a API de exportação.
// Não faz parte da superfície pública.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const TOKEN = 'token-de-teste-com-32-caracteres-ok';

export type Reply = { status?: number; body?: string; chunkSize?: number; abortAfter?: number };

export async function readFixture(site: string): Promise<string> {
  return readFile(
    new URL(import.meta.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`)),
    'utf8',
  );
}

/** Sobe um servidor que responde conforme `reply(site)`; exige o token do build. */
export async function startServer(
  reply: (site: string) => Reply,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end();
      return;
    }
    const match = /^\/api\/export\/v1\/sites\/([^/]+)\/snapshot$/.exec(req.url ?? '');
    if (!match?.[1]) {
      res.writeHead(404).end();
      return;
    }
    const {
      status = 200,
      body = '',
      chunkSize = 64,
      abortAfter,
    } = reply(decodeURIComponent(match[1]));
    res.writeHead(status, { 'content-type': 'application/x-ndjson' });
    const bytes = Buffer.from(body);
    let offset = 0;
    const next = () => {
      if (abortAfter !== undefined && offset >= abortAfter) {
        res.destroy();
        return;
      }
      if (offset >= bytes.length) {
        res.end();
        return;
      }
      res.write(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
      setImmediate(next);
    };
    next();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
