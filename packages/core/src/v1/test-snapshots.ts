// Snapshots dos testes: as fixtures do content-model (exemplo-a, exemplo-b), validadas como
// no build, e cópias alteradas para cada caso. Não faz parte da superfície pública.
import { readFile } from 'node:fs/promises';
import {
  parseSnapshotLine,
  validateSnapshot,
  type SnapshotLine,
  type Snapshot,
} from '@orakel/content-model/v1';

export async function fixture(site: 'exemplo-a' | 'exemplo-b'): Promise<Snapshot> {
  const text = await readFile(
    new URL(import.meta.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`)),
    'utf8',
  );
  const lines = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): SnapshotLine => {
      const parsed = parseSnapshotLine(JSON.parse(line));
      if (!parsed.ok) throw new Error(`Fixture inválida: ${JSON.stringify(parsed.issues)}`);
      return parsed.value;
    });
  const snapshot = validateSnapshot(lines);
  if (!snapshot.ok) throw new Error(`Fixture inválida: ${JSON.stringify(snapshot.issues)}`);
  return snapshot.value;
}

/** Cópia do snapshot com as mudanças do caso de teste. */
export function changed(snapshot: Snapshot, change: (copy: Snapshot) => void): Snapshot {
  const copy = structuredClone(snapshot);
  change(copy);
  return copy;
}

export function indexable(snapshot: Snapshot): Snapshot {
  return changed(snapshot, (copy) => {
    copy.config.indexavel = true;
  });
}
