// "@orakel/content-client/v1/astro": loaders do Content Layer do Astro (único ponto do
// pacote que depende do Astro).

export {
  SNAPSHOT_COLLECTIONS,
  SnapshotReadError,
  snapshotLoaders,
  type SnapshotCollection,
  type SnapshotLoadersOptions,
} from './loaders.ts';
