// Toda fixture NDJSON de toda versão passa no schema e na validação semântica.
// Mudou o schema e a fixture não acompanhou? Este teste quebra no mesmo PR.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { Issue, Result } from './result.ts';
import * as v1 from './v1/index.ts';

/** Schema linha a linha e, se todas passarem, a validação semântica do snapshot. */
const VALIDATORS: Record<string, (lines: unknown[]) => Result<unknown>> = {
  v1: (lines) => {
    const values: v1.SnapshotLine[] = [];
    const issues: Issue[] = [];
    lines.forEach((line, index) => {
      const result = v1.parseSnapshotLine(line);
      if (result.ok) values.push(result.value);
      else
        issues.push(...result.issues.map((issue) => ({ ...issue, path: [index, ...issue.path] })));
    });
    return issues.length > 0 ? { ok: false, issues } : v1.validateSnapshot(values);
  },
};

const fixturesDir = (version: string) => new URL(`../fixtures/${version}/`, import.meta.url);

const readNdjson = (url: URL): unknown[] =>
  readFileSync(url, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as unknown);

describe.each(Object.entries(VALIDATORS))('fixtures %s', (version, validate) => {
  const files = readdirSync(fixturesDir(version)).filter((file) => file.endsWith('.ndjson'));

  it('existem os dois sites de exemplo', () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files)('%s passa no schema e na validação semântica', (file) => {
    const result = validate(readNdjson(new URL(file, fixturesDir(version))));
    expect(result.ok ? [] : result.issues).toEqual([]);
  });
});
