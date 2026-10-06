import type { Issue, Result } from '@orakel/content-model';
import {
  parseSnapshotLine,
  validateSnapshot,
  type EndLine,
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

const fail = (code: string, message: string, path: PropertyKey[] = []): Result<never> => ({
  ok: false,
  issues: [{ code, message, path }],
});

/**
 * Lê o snapshot de um site em streaming: cada linha pelo `parseSnapshotLine` (campos
 * desconhecidos são descartados) e o conjunto pelo `validateSnapshot` (header, end,
 * contagens: um corte vira `semantic.snapshot-structure`, transitório).
 */
export async function readSnapshot(request: SnapshotRequest): Promise<Result<ReadSnapshot>> {
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
  let index = 0;
  try {
    for await (const raw of ndjsonLines(response.body)) {
      let json: unknown;
      try {
        json = JSON.parse(raw);
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
  if (issues.length > 0) return { ok: false, issues };

  const validated = validateSnapshot(lines);
  if (!validated.ok) return validated;
  const end = lines.at(-1);
  if (end?.type !== 'end') return fail('truncated', 'Snapshot sem a linha end');
  return { ok: true, value: { ...validated.value, end } };
}
