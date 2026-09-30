// Modo `fixture`: um `fetch` que responde à rota do snapshot com a fixture do content-model,
// em streaming. O content-client lê e valida exatamente como leria a API.
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

/** Endereço fictício da API no modo fixture; nenhuma requisição sai da máquina. */
export const FIXTURE_BASE_URL = 'http://fixtures.invalid';
export const FIXTURE_TOKEN = 'fixture';

const require = createRequire(import.meta.url);
const SNAPSHOT_ROUTE = /\/api\/export\/v1\/sites\/([a-z0-9-]+)\/snapshot$/;

/** Caminho da fixture do site, ou undefined se o content-model não tem fixture para ele. */
export function fixturePath(site: string): string | undefined {
  try {
    return require.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`);
  } catch {
    return undefined;
  }
}

export const fixtureFetch: typeof fetch = (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const site = SNAPSHOT_ROUTE.exec(url.pathname)?.[1];
  const file = site === undefined ? undefined : fixturePath(site);
  if (!file) return Promise.resolve(new Response('Fixture não encontrada', { status: 404 }));
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return Promise.resolve(
    new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }),
  );
};
