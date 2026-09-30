// _headers (`05`, seção 3.4; ADR 0006): segurança mínima e, com `indexavel` desligado,
// X-Robots-Tag em tudo; `immutable` só nos caminhos com hash.
import type { Snapshot } from '@orakel/content-model/v1';
import { CACHE_CONTROL, IMMUTABLE_PATHS, SECURITY_HEADERS } from '../policy.ts';

export const HEADERS_PATH = '/_headers';

export function headersFile(snapshot: Pick<Snapshot, 'config'>): string {
  const all: Record<string, string> = { ...SECURITY_HEADERS };
  if (!snapshot.config.indexavel) all['X-Robots-Tag'] = 'noindex';

  const rule = (path: string, headers: Record<string, string>) =>
    `${path}\n${Object.entries(headers)
      .map(([name, value]) => `  ${name}: ${value}\n`)
      .join('')}`;

  return [
    rule('/*', all),
    ...IMMUTABLE_PATHS.map((path) => rule(path, { 'Cache-Control': CACHE_CONTROL.immutable })),
  ].join('');
}
