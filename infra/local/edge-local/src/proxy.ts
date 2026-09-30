// Proxy dos sites: `<site>.localhost` no Host → instância ativa do site. Repassa método,
// cabeçalhos e corpo em streaming e devolve a resposta como veio (status, cabeçalhos).
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer } from 'node:http';

import type { Supervisor } from './supervisor.ts';

export const HOST_SUFFIX = '.localhost';

/** `exemplo-a.localhost:8080` → `exemplo-a`; outros hosts → undefined. */
export function siteOfHost(host: string | undefined): string | undefined {
  const name = (host ?? '').toLowerCase().replace(/:\d+$/, '');
  if (!name.endsWith(HOST_SUFFIX)) return undefined;
  const site = name.slice(0, -HOST_SUFFIX.length);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site) ? site : undefined;
}

export function proxyHandler(supervisor: Pick<Supervisor, 'target'>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const site = siteOfHost(req.headers.host);
    const target = site === undefined ? undefined : supervisor.target(site);
    if (!target) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(
        site ? `Site "${site}" sem versão publicada no edge-local\n` : 'Use <site>.localhost\n',
      );
      return;
    }
    const upstream = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`edge-local: ${error.message}\n`);
    });
    req.pipe(upstream);
  };
}

export function startProxy(supervisor: Pick<Supervisor, 'target'>, port: number) {
  return createServer(proxyHandler(supervisor)).listen(port, '0.0.0.0');
}
