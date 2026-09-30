// Servidor estático mínimo para os testes, com o comportamento do Workers Static Assets que
// importa aqui: /x/ → x/index.html e 404.html com status 404.
//
//   node e2e/static-server.ts <pasta> <porta>
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.pagefind': 'application/octet-stream',
  '.pf_meta': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
};

const [dir = '.', port = '4400'] = process.argv.slice(2);

async function file(path: string): Promise<string | undefined> {
  const target = join(dir, normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, ''));
  const candidate = path.endsWith('/') ? join(target, 'index.html') : target;
  return (await stat(candidate).catch(() => undefined))?.isFile() ? candidate : undefined;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const found = await file(pathname);
  const target = found ?? join(dir, '404.html');
  res.writeHead(found ? 200 : 404, { 'content-type': TYPES[extname(target)] ?? 'text/plain' });
  res.end(await readFile(target));
}

createServer((req, res) => void handle(req, res)).listen(Number(port), '127.0.0.1');
