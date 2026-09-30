import { indexManifest, parseEventManifest } from '@orakel/events/v1';

export type ManifestIndex = ReadonlyMap<number, string>;

/**
 * Lê o manifesto de eventos uma vez por isolate e mantém o índice em memória. Se a
 * leitura falhar, a próxima chamada tenta de novo (o evento em curso se perde).
 */
export function createManifestCache(load: () => Promise<unknown>): () => Promise<ManifestIndex> {
  let cached: Promise<ManifestIndex> | undefined;

  const read = async (): Promise<ManifestIndex> => {
    const parsed = parseEventManifest(await load());
    if (!parsed.ok) throw new Error('Manifesto de eventos inválido', { cause: parsed.issues });
    return indexManifest(parsed.value);
  };

  return async () => {
    cached ??= read();
    try {
      return await cached;
    } catch (error) {
      cached = undefined;
      throw error;
    }
  };
}
