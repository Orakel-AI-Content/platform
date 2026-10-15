import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseSnapshotLine,
  SCHEMA_VERSION,
  type Author,
  type Content,
  type Menu,
  type Redirect,
  type SiteConfig,
  type SnapshotLine,
  type Taxonomy,
} from '@orakel/content-model/v1';

import { detectImageFormat } from '../media/formats.ts';
import { normalizeImage, storeOriginal } from '../media/ingest.ts';
import type { ObjectStore } from '../media/store.ts';
import { generateVariants } from '../media/variants.ts';
import type { MediaOrigin } from './import-snapshot.ts';

// Site completo do ambiente local (`infra/local/seeds/<site>/`): `site.json` com a
// configuração e o conteúdo, e as imagens de verdade em `imagens/`. Diferente das fixtures,
// a mídia não vem pronta: cada imagem passa pela mesma normalização e pelas mesmas
// variantes de um envio, e o snapshot é montado com o que foi gerado.

/** Imagem do seed: o arquivo em `imagens/` e o envio que a biblioteca mostra. */
export type SiteSeedMedia = { id: number; file: string; originalName: string; uploadedAt: string };

export type SiteSeed = {
  config: SiteConfig;
  authors: Author[];
  taxonomies: Taxonomy[];
  menus: Menu[];
  redirects: Redirect[];
  media: SiteSeedMedia[];
  contents: Content[];
};

/** Pastas com `site.json` dentro do diretório de seeds, em ordem alfabética. */
export async function listSiteSeeds(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const exists = await readFile(join(dir, entry.name, 'site.json')).then(
      () => true,
      () => false,
    );
    if (exists) found.push(join(dir, entry.name));
  }
  return found.sort();
}

/** Lê o `site.json`; a validação acontece nas linhas do snapshot (`siteSeedLines`). */
export async function readSiteSeed(dir: string): Promise<SiteSeed> {
  return JSON.parse(await readFile(join(dir, 'site.json'), 'utf8')) as SiteSeed;
}

export type SeedMedia = { lines: SnapshotLine[]; origins: Map<number, MediaOrigin> };

/**
 * Normaliza cada imagem, guarda o original e gera as variantes do perfil no bucket do site,
 * como o worker faz com um envio. Repetir regrava os mesmos objetos (nomes pelo hash).
 */
export async function processSeedMedia(
  store: ObjectStore,
  dir: string,
  seed: SiteSeed,
): Promise<SeedMedia> {
  const siteId = seed.config.siteId;
  const lines: SnapshotLine[] = [];
  const origins = new Map<number, MediaOrigin>();
  for (const item of seed.media) {
    const raw = await readFile(join(dir, 'imagens', item.file));
    const format = detectImageFormat(raw);
    if (format === undefined) throw new Error(`${item.file}: não é JPEG, PNG, WebP nem AVIF`);
    const image = await normalizeImage(raw, format);
    const originalKey = await storeOriginal(store, siteId, image);
    const generated = await generateVariants(store, {
      siteId,
      originalKey,
      width: image.width,
      height: image.height,
    });
    if (generated.status === 'missing') throw new Error(`${item.file}: original não gravado`);
    lines.push({ type: 'media', data: { id: item.id, ...generated.media } });
    origins.set(item.id, {
      originalKey,
      originalName: item.originalName,
      uploadedAt: new Date(item.uploadedAt),
    });
  }
  return { lines, origins };
}

/** Snapshot completo do seed, com as linhas de mídia geradas; cada linha passa pelo schema. */
export function siteSeedLines(seed: SiteSeed, media: SnapshotLine[]): SnapshotLine[] {
  const body: SnapshotLine[] = [
    { type: 'config', data: seed.config },
    ...seed.authors.map((data) => ({ type: 'author' as const, data })),
    ...seed.taxonomies.map((data) => ({ type: 'taxonomy' as const, data })),
    ...seed.menus.map((data) => ({ type: 'menu' as const, data })),
    ...media,
    ...seed.redirects.map((data) => ({ type: 'redirect' as const, data })),
    ...seed.contents.map((data) => ({ type: 'content' as const, data })),
  ];
  const count = (type: SnapshotLine['type']) => body.filter((line) => line.type === type).length;
  const lines: unknown[] = [
    {
      type: 'header',
      schemaVersion: SCHEMA_VERSION,
      site: seed.config.siteId,
      pendingChangeIds: [],
    },
    ...body,
    {
      type: 'end',
      counts: {
        config: count('config'),
        author: count('author'),
        taxonomy: count('taxonomy'),
        menu: count('menu'),
        media: count('media'),
        redirect: count('redirect'),
        content: count('content'),
      },
    },
  ];
  return lines.map((line, index) => {
    const parsed = parseSnapshotLine(line);
    if (!parsed.ok) {
      throw new Error(
        `Seed de ${seed.config.siteId}, linha ${index + 1}: ${JSON.stringify(parsed.issues)}`,
      );
    }
    return parsed.value;
  });
}
