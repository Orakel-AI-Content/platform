import * as z from 'zod';

import { parseWith, type Result } from '../result.ts';
import { PathSchema } from './payload.ts';
import { FORMAT_VERSION } from './version.ts';

// Manifesto de eventos (ADR 0003): gerado no build com os artigos publicados, servido nos
// assets do site (`EVENT_MANIFEST_PATH`) e lido pelo Worker, que o mantém em memória.
// Na fase 3 ganha os blocos de afiliado (produto, programa, destino) como campo opcional.

export const ManifestArticleSchema = z.object({
  id: z.number().int().positive(),
  path: PathSchema,
});

export const EventManifestSchema = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
  articles: z.array(ManifestArticleSchema),
});

export type EventManifest = z.infer<typeof EventManifestSchema>;
export type ManifestArticle = z.infer<typeof ManifestArticleSchema>;

/** Para o build: manifesto ordenado por ID, para que o mesmo snapshot gere o mesmo arquivo. */
export function buildEventManifest(articles: readonly ManifestArticle[]): EventManifest {
  return {
    formatVersion: FORMAT_VERSION,
    articles: [...articles].sort((a, b) => a.id - b.id).map(({ id, path }) => ({ id, path })),
  };
}

/** Para o Worker: valida o JSON lido dos assets. */
export function parseEventManifest(json: unknown): Result<EventManifest> {
  return parseWith(EventManifestSchema, json);
}

/** Para o Worker: caminho de cada artigo publicado, por ID. */
export function indexManifest(manifest: EventManifest): ReadonlyMap<number, string> {
  return new Map(manifest.articles.map((article) => [article.id, article.path]));
}
