import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EndLine, HeaderLine } from '@orakel/content-model/v1';

/**
 * O que o render do site-builder precisa do snapshot lido dentro do `astro build`: o
 * header (pendingChangeIds a baixar) e o end (contagens). ADR 0002.
 */
export type SnapshotMeta = { header: HeaderLine; end: EndLine };

export async function writeSnapshotMeta(file: string, meta: SnapshotMeta): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}
