// API de administração (12.0, L3; ADR 0003 da unidade), só na rede publish:
//
//   PUT  /sites/{site}/versions   tar.gz do publish → 201 { id }
//   GET  /sites/{site}/versions   { active, versions: [{ id, createdAt, files, active }] }
//   POST /sites/{site}/rollback   { id }? → { active }  (sem id: a anterior à ativa)
//   GET  /healthz
//   POST /_ae-sim/points          ponto do Analytics Engine → ClickHouse (ou NDJSON, sem ele)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { DataPoint, Sink } from './ae-sink.ts';
import { StoreError } from './store.ts';
import type { Log, Supervisor } from './supervisor.ts';

export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new StoreError(`Corpo maior que ${limit} bytes`, 400);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(`${JSON.stringify(data)}\n`);
}

/** `ready`: versões ativas restauradas e proxy no ar — antes disso, /healthz responde 503. */
export function adminHandler(
  supervisor: Supervisor,
  sink: Sink,
  log: Log,
  ready: () => boolean = () => true,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const { pathname } = new URL(req.url ?? '/', 'http://edge-local');
    const route = /^\/sites\/([^/]+)\/(versions|rollback)$/.exec(pathname);
    try {
      if (req.method === 'GET' && pathname === '/healthz') {
        return json(res, ready() ? 200 : 503, {
          ok: ready(),
          sites: await supervisor.store.sites(),
        });
      }
      if (req.method === 'POST' && pathname === '/_ae-sim/points') {
        const point = JSON.parse((await body(req, 64 * 1024)).toString('utf8')) as DataPoint;
        await sink(point, new Date());
        res.writeHead(204).end();
        return;
      }
      if (route) {
        const site = decodeURIComponent(route[1]!);
        if (route[2] === 'versions' && req.method === 'PUT') {
          const id = await supervisor.publish(site, await body(req, MAX_ARCHIVE_BYTES));
          return json(res, 201, { id });
        }
        if (route[2] === 'versions' && req.method === 'GET') {
          return json(res, 200, await supervisor.store.list(site));
        }
        if (route[2] === 'rollback' && req.method === 'POST') {
          const raw = (await body(req, 4096)).toString('utf8').trim();
          const requested = raw ? (JSON.parse(raw) as { id?: unknown }).id : undefined;
          if (requested !== undefined && typeof requested !== 'string') {
            throw new StoreError('id deve ser texto', 400);
          }
          return json(res, 200, { active: await supervisor.rollback(site, requested) });
        }
      }
      return json(res, 404, { error: 'Rota não encontrada' });
    } catch (error) {
      if (error instanceof StoreError) return json(res, error.status, { error: error.message });
      if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON inválido' });
      log({ msg: 'erro na administração', error: String(error) });
      return json(res, 500, { error: 'Erro no edge-local' });
    }
  };
}

export function startAdmin(
  supervisor: Supervisor,
  sink: Sink,
  port: number,
  log: Log,
  ready?: () => boolean,
) {
  const handler = adminHandler(supervisor, sink, log, ready);
  return createServer((req, res) => void handler(req, res)).listen(port, '0.0.0.0');
}
