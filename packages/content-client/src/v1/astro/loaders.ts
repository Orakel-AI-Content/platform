import type { Snapshot } from '@orakel/content-model/v1';
import type { Loader, LoaderContext } from 'astro/loaders';

import { failureKind } from '../../failures.ts';
import { writeSnapshotMeta } from '../meta-file.ts';
import { readSnapshot, type ReadSnapshot, type SnapshotRequest } from '../read-snapshot.ts';

export type SnapshotLoadersOptions = SnapshotRequest & {
  /** Onde gravar { header, end } para o render (result.json). */
  metaFile?: string;
};

/** Coleções do Content Layer alimentadas pelo snapshot. */
export const SNAPSHOT_COLLECTIONS = [
  'config',
  'authors',
  'taxonomies',
  'menus',
  'media',
  'redirects',
  'contents',
] as const;

export type SnapshotCollection = (typeof SNAPSHOT_COLLECTIONS)[number];

/** Erro de leitura com a classificação, para o render escolher o código de saída. */
export class SnapshotReadError extends Error {
  readonly kind: 'transient' | 'permanent';

  constructor(message: string, kind: 'transient' | 'permanent') {
    super(message);
    this.name = 'SnapshotReadError';
    this.kind = kind;
  }
}

function entries(
  snapshot: Snapshot,
  collection: SnapshotCollection,
): { id: string; data: object }[] {
  switch (collection) {
    case 'config':
      return [{ id: 'config', data: snapshot.config }];
    case 'authors':
      return snapshot.authors.map((data) => ({ id: String(data.id), data }));
    case 'taxonomies':
      return snapshot.taxonomies.map((data) => ({ id: String(data.id), data }));
    case 'menus':
      return snapshot.menus.map((data) => ({ id: data.key, data }));
    case 'media':
      return snapshot.media.map((data) => ({ id: String(data.id), data }));
    case 'redirects':
      return snapshot.redirects.map((data) => ({ id: String(data.id), data }));
    case 'contents':
      return snapshot.contents.map((data) => ({ id: String(data.id), data }));
  }
}

/**
 * Um loader por coleção, todos alimentados pela MESMA leitura do snapshot (uma por
 * build): os pendingChangeIds do header correspondem exatamente ao conteúdo publicado.
 * Sem `schema` do Astro: a validação é a do content-model; o blog tipa as entradas com os
 * tipos dele. ADR 0002.
 */
export function snapshotLoaders(
  options: SnapshotLoadersOptions,
): Record<SnapshotCollection, Loader> {
  let reading: Promise<ReadSnapshot> | undefined;

  const readOnce = (): Promise<ReadSnapshot> => {
    reading ??= readSnapshot(options).then(async (result) => {
      if (!result.ok) {
        const kind = failureKind(result.issues);
        throw new SnapshotReadError(
          `Snapshot de ${options.site} inválido (${kind}): ${JSON.stringify(result.issues.slice(0, 5))}`,
          kind,
        );
      }
      if (options.metaFile) {
        await writeSnapshotMeta(options.metaFile, {
          header: result.value.header,
          end: result.value.end,
        });
      }
      return result.value;
    });
    return reading;
  };

  const loader = (collection: SnapshotCollection): Loader => ({
    name: `orakel-snapshot-${collection}`,
    load: async (context: LoaderContext) => {
      const snapshot = await readOnce();
      context.store.clear();
      for (const entry of entries(snapshot, collection)) {
        const data = await context.parseData({
          id: entry.id,
          data: entry.data as Record<string, unknown>,
        });
        context.store.set({ id: entry.id, data });
      }
      context.logger.info(`${collection}: ${context.store.keys().length} entradas do snapshot`);
    },
  });

  return Object.fromEntries(SNAPSHOT_COLLECTIONS.map((c) => [c, loader(c)])) as Record<
    SnapshotCollection,
    Loader
  >;
}
