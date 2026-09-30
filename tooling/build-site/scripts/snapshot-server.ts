// API de exportação mínima para a fumaça e as medições: serve um NDJSON por site na rota
// do snapshot, exigindo o token do build. Sem backoffice nem banco.
//
//   node scripts/snapshot-server.ts <porta> <site>=<arquivo.ndjson> [...]
//   node scripts/snapshot-server.ts 8080 fixtures   (as fixtures do content-model)
import { createReadStream, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';

export const SMOKE_TOKEN = 'smoke-build-token-0000000000000000';

export function startSnapshotServer(
  port: number,
  files: Record<string, string>,
  token = SMOKE_TOKEN,
): Server {
  return createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    const site = /^\/api\/export\/v1\/sites\/([a-z0-9-]+)\/snapshot$/.exec(req.url ?? '')?.[1];
    const file = site ? files[site] : undefined;
    if (!file || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    createReadStream(file).pipe(res);
  }).listen(port, '0.0.0.0');
}

export function fixtureFiles(): Record<string, string> {
  const require = createRequire(import.meta.url);
  return Object.fromEntries(
    ['exemplo-a', 'exemplo-b'].map((site) => [
      site,
      require.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`),
    ]),
  );
}

if (import.meta.main) {
  const [port = '8080', ...args] = process.argv.slice(2);
  const files =
    args[0] === 'fixtures'
      ? fixtureFiles()
      : Object.fromEntries(args.map((arg) => arg.split('=') as [string, string]));
  startSnapshotServer(Number(port), files);
  console.log(
    JSON.stringify({ msg: 'snapshot-server no ar', port: Number(port), sites: Object.keys(files) }),
  );
}
