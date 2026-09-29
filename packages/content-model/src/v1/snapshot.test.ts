import { describe, expect, it } from 'vitest';

import { parseSnapshotLine } from './snapshot.ts';
import { buildSnapshotLines } from './test-builders.ts';

describe('parseSnapshotLine', () => {
  it.each(buildSnapshotLines().map((line) => [line.type, line] as const))(
    'aceita a linha %s',
    (_, line) => {
      expect(parseSnapshotLine(JSON.parse(JSON.stringify(line)) as unknown)).toEqual({
        ok: true,
        value: line,
      });
    },
  );

  it('recusa header de outra versão de schema', () => {
    const result = parseSnapshotLine({
      type: 'header',
      schemaVersion: 2,
      site: 'x',
      pendingChangeIds: [],
    });
    expect(result.ok).toBe(false);
  });

  it('recusa tipo de linha desconhecido', () => {
    expect(parseSnapshotLine({ type: 'comment', data: {} }).ok).toBe(false);
  });

  it('recusa entidade inválida dentro de data, com o caminho do campo', () => {
    const result = parseSnapshotLine({ type: 'author', data: { id: 1, slug: 'Ana', name: 'Ana' } });
    expect(!result.ok && result.issues[0]?.path).toEqual(['data', 'slug']);
  });

  it('recusa end com contagem negativa', () => {
    const end = buildSnapshotLines().at(-1);
    expect(parseSnapshotLine({ ...end, counts: { content: -1 } }).ok).toBe(false);
  });
});
