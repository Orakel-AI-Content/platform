import * as z from 'zod';

import { parseWith, type Result } from '../result.ts';
import { IdSchema, SlugSchema } from './common.ts';
import {
  AuthorSchema,
  ContentSchema,
  MediaSchema,
  MenuSchema,
  RedirectSchema,
  SiteConfigSchema,
  TaxonomySchema,
} from './entities/index.ts';
import { SCHEMA_VERSION } from './version.ts';

// Linhas do snapshot NDJSON da API de exportação (ADR 0003): `header` primeiro, uma linha
// por entidade (`{ type, data }`) e `end` por último, com as contagens que o render usa
// para detectar um corte. O Backoffice produz, o content-client consome; os dois validam
// com este schema.

export const ENTITY_TYPES = [
  'config',
  'author',
  'taxonomy',
  'menu',
  'media',
  'redirect',
  'content',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const HeaderLineSchema = z.object({
  type: z.literal('header'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  site: SlugSchema,
  /** Mudanças pendentes visíveis no snapshot; o build as baixa por esta lista. */
  pendingChangeIds: z.array(IdSchema),
});

const entityLine = <T extends EntityType, S extends z.ZodType>(type: T, data: S) =>
  z.object({ type: z.literal(type), data });

export const ConfigLineSchema = entityLine('config', SiteConfigSchema);
export const AuthorLineSchema = entityLine('author', AuthorSchema);
export const TaxonomyLineSchema = entityLine('taxonomy', TaxonomySchema);
export const MenuLineSchema = entityLine('menu', MenuSchema);
export const MediaLineSchema = entityLine('media', MediaSchema);
export const RedirectLineSchema = entityLine('redirect', RedirectSchema);
export const ContentLineSchema = entityLine('content', ContentSchema);

const count = z.number().int().nonnegative();

export const EndLineSchema = z.object({
  type: z.literal('end'),
  counts: z.object({
    config: count,
    author: count,
    taxonomy: count,
    menu: count,
    media: count,
    redirect: count,
    content: count,
  }),
});

export const SnapshotLineSchema = z.discriminatedUnion('type', [
  HeaderLineSchema,
  ConfigLineSchema,
  AuthorLineSchema,
  TaxonomyLineSchema,
  MenuLineSchema,
  MediaLineSchema,
  RedirectLineSchema,
  ContentLineSchema,
  EndLineSchema,
]);

export type SnapshotLine = z.infer<typeof SnapshotLineSchema>;
export type HeaderLine = z.infer<typeof HeaderLineSchema>;
export type EndLine = z.infer<typeof EndLineSchema>;

/** Valida uma linha já decodificada do NDJSON (`JSON.parse`). */
export function parseSnapshotLine(line: unknown): Result<SnapshotLine> {
  return parseWith(SnapshotLineSchema, line);
}
