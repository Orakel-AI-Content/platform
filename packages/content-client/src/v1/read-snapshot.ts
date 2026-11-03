import type { Issue, Result } from '@orakel/content-model';
import {
  ENTITY_TYPES,
  parseSnapshotLine,
  validateSnapshot,
  type EndLine,
  type EntityType,
  type Snapshot,
  type SnapshotLine,
} from '@orakel/content-model/v1';

import { snapshotUrl, type SnapshotKind } from '../index.ts';
import { ndjsonLines } from './ndjson.ts';

export type SnapshotRequest = {
  /** Base da API de exportação na rede interna (ex.: http://backoffice-web:3000). */
  baseUrl: string;
  site: string;
  /** Snapshot do build (padrão) ou da visualização. */
  kind?: SnapshotKind;
  /** Token interno do consumidor (Bearer): o do build ou o da visualização. Nunca é logado. */
  token: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

/** Snapshot validado, com o `end` (contagens) para o result.json do render. */
export type ReadSnapshot = Snapshot & { end: EndLine };

/**
 * A entidade que causou a falha, na identidade de `pending_changes`: `String(id)`, ou
 * `'config'` para a configuração (o snapshot não traz a versão dela).
 */
export type SnapshotCulprit = { origin: EntityType; reference: string };

/** `Result` da leitura; a falha aponta o culpado quando uma issue cai numa entidade. */
export type ReadSnapshotResult =
  { ok: true; value: ReadSnapshot } | { ok: false; issues: Issue[]; culprit?: SnapshotCulprit };

const fail = (code: string, message: string, path: PropertyKey[] = []): Result<never> => ({
  ok: false,
  issues: [{ code, message, path }],
});

const COLLECTION_TYPES: Record<string, EntityType> = {
  authors: 'author',
  taxonomies: 'taxonomy',
  menus: 'menu',
  media: 'media',
  redirects: 'redirect',
  contents: 'content',
};

function identity(type: unknown, data: unknown): SnapshotCulprit | undefined {
  if (!ENTITY_TYPES.includes(type as EntityType)) return undefined;
  if (type === 'config') return { origin: 'config', reference: 'config' };
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === 'number' || (typeof id === 'string' && id !== '')
    ? { origin: type as EntityType, reference: String(id) }
    : undefined;
}

/** Issue do parse: `path` começa pelo índice da linha; a identidade vem do JSON cru. */
function parseCulprit(issues: readonly Issue[], raws: readonly unknown[]) {
  for (const { path } of issues) {
    const line = typeof path[0] === 'number' ? raws[path[0]] : undefined;
    const found = identity(
      (line as { type?: unknown } | null)?.type,
      (line as { data?: unknown } | null)?.data,
    );
    if (found) return found;
  }
  return undefined;
}

/** Issue semântica: `path` é `['config', ...]` ou `[<coleção>, i, ...]` do snapshot montado. */
function semanticCulprit(issues: readonly Issue[], lines: readonly SnapshotLine[]) {
  for (const { code, path } of issues) {
    if (code === 'semantic.snapshot-structure') continue;
    if (path[0] === 'config') return identity('config', undefined);
    const type = typeof path[0] === 'string' ? COLLECTION_TYPES[path[0]] : undefined;
    if (type === undefined || typeof path[1] !== 'number') continue;
    const line = lines.filter((candidate) => candidate.type === type)[path[1]];
    const found = line && 'data' in line ? identity(type, line.data) : undefined;
    if (found) return found;
  }
  return undefined;
}

/**
 * Lê o snapshot de um site em streaming: cada linha pelo `parseSnapshotLine` (campos
 * desconhecidos são descartados) e o conjunto pelo `validateSnapshot` (header, end,
 * contagens: um corte vira `semantic.snapshot-structure`, transitório).
 */
export async function readSnapshot(request: SnapshotRequest): Promise<ReadSnapshotResult> {
  const doFetch = request.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(snapshotUrl(request.baseUrl, request.site, 1, request.kind), {
      headers: { authorization: `Bearer ${request.token}`, accept: 'application/x-ndjson' },
      signal: request.signal,
    });
  } catch (error) {
    return fail('network', `Falha de rede ao ler o snapshot: ${String(error)}`);
  }
  if (!response.ok || response.body === null) {
    return fail(`http.${response.status}`, `A API de exportação respondeu ${response.status}`);
  }

  const lines: SnapshotLine[] = [];
  const issues: Issue[] = [];
  const raws: unknown[] = [];
  let index = 0;
  try {
    for await (const raw of ndjsonLines(response.body)) {
      let json: unknown;
      try {
        json = JSON.parse(raw);
        raws[index] = json;
      } catch {
        issues.push({ code: 'json', message: 'Linha que não é JSON', path: [index] });
        index += 1;
        continue;
      }
      const parsed = parseSnapshotLine(json);
      if (parsed.ok) lines.push(parsed.value);
      else
        issues.push(...parsed.issues.map((issue) => ({ ...issue, path: [index, ...issue.path] })));
      index += 1;
    }
  } catch (error) {
    return fail('truncated', `A leitura do snapshot foi interrompida: ${String(error)}`);
  }
  if (issues.length > 0) return withCulprit(issues, parseCulprit(issues, raws));

  const validated = validateSnapshot(lines);
  if (!validated.ok) return withCulprit(validated.issues, semanticCulprit(validated.issues, lines));
  const end = lines.at(-1);
  if (end?.type !== 'end') return fail('truncated', 'Snapshot sem a linha end');
  return { ok: true, value: { ...validated.value, end } };
}

const withCulprit = (issues: Issue[], culprit: SnapshotCulprit | undefined): ReadSnapshotResult =>
  culprit ? { ok: false, issues, culprit } : { ok: false, issues };
