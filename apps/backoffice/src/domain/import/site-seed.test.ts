import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSnapshot, type SnapshotLine } from '@orakel/content-model/v1';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { memoryStore } from '../media/store.ts';
import { profileVariants } from '../media/variants.ts';
import {
  listSiteSeeds,
  processSeedMedia,
  readSiteSeed,
  siteSeedLines,
  type SiteSeed,
} from './site-seed.ts';

// Sites completos do ambiente local (infra/local/seeds/<site>/): o seed do Horta em Casa
// vira um snapshot válido, e as imagens passam pela normalização e pelas variantes.

const SEEDS_DIR = fileURLToPath(new URL('../../../../../infra/local/seeds/', import.meta.url));

/** Linhas de mídia com as variantes do perfil, sem processar imagem nenhuma. */
const fakeMedia = (seed: SiteSeed, width = 1920, height = 1080): SnapshotLine[] =>
  seed.media.map(({ id }) => ({
    type: 'media',
    data: {
      id,
      width,
      height,
      variants: profileVariants(width).map((variant) => ({
        ...variant,
        path: `${seed.config.siteId}/${String(id).padStart(64, '0')}-${variant.width}.${variant.format}`,
      })),
    },
  }));

describe('seed de site completo', () => {
  it('encontra o Horta em Casa no diretório de seeds', async () => {
    expect(await listSiteSeeds(SEEDS_DIR)).toEqual([join(SEEDS_DIR, 'horta-em-casa')]);
    expect(await listSiteSeeds('/nao/existe')).toEqual([]);
  });

  it('o Horta em Casa vira um snapshot válido, com 10 artigos e todos os blocos', async () => {
    const seed = await readSiteSeed(join(SEEDS_DIR, 'horta-em-casa'));
    const lines = siteSeedLines(seed, fakeMedia(seed));

    const validated = validateSnapshot(lines);
    expect(validated.ok ? [] : validated.issues).toEqual([]);
    const contents = seed.contents;
    expect(contents.filter((content) => content.kind === 'article')).toHaveLength(10);
    const blockTypes = new Set(contents.flatMap((content) => content.blocks.map((b) => b.type)));
    expect([...blockTypes].sort()).toEqual(['faq', 'image', 'quote', 'text', 'toc']);
    expect(new Set(seed.taxonomies.map((taxonomy) => taxonomy.kind))).toEqual(
      new Set(['category', 'tag', 'series']),
    );
    expect(lines.at(-1)).toMatchObject({ type: 'end', counts: { content: 11, media: 16 } });
  });

  it('linha inválida para o seed com o número da linha', async () => {
    const seed = await readSiteSeed(join(SEEDS_DIR, 'horta-em-casa'));
    const broken = { ...seed, authors: [{ ...seed.authors[0]!, name: '' }] };

    expect(() => siteSeedLines(broken, [])).toThrow(/Seed de horta-em-casa, linha 3/);
  });

  it('processa as imagens como um envio: original, variantes e a origem de cada mídia', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-seed-'));
    await mkdir(join(dir, 'imagens'));
    const jpeg = await sharp({
      create: { width: 700, height: 400, channels: 3, background: '#3f8f4a' },
    })
      .jpeg()
      .toBuffer();
    await writeFile(join(dir, 'imagens', 'folha.jpg'), jpeg);
    await writeFile(join(dir, 'imagens', 'texto.jpg'), 'não é imagem');
    const seed = {
      config: { siteId: 'horta-em-casa' },
      media: [
        {
          id: 7,
          file: 'folha.jpg',
          originalName: 'Folha 01.jpg',
          uploadedAt: '2026-08-02T11:03:00.000Z',
        },
      ],
    } as unknown as SiteSeed;
    const store = memoryStore();

    const { lines, origins } = await processSeedMedia(store, dir, seed);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: 'media', data: { id: 7, width: 700, height: 400 } });
    const origin = origins.get(7);
    expect(origin?.originalKey).toMatch(/^horta-em-casa\/[0-9a-f]{64}\.jpg$/);
    expect(origin).toMatchObject({
      originalName: 'Folha 01.jpg',
      uploadedAt: new Date('2026-08-02T11:03:00.000Z'),
    });
    expect(store.objects.has(`media-originals/${origin?.originalKey}`)).toBe(true);
    const variants = [...store.objects.keys()].filter((key) =>
      key.startsWith('media-horta-em-casa/'),
    );
    expect(variants).toHaveLength(profileVariants(700).length);

    const broken = { ...seed, media: [{ ...seed.media[0]!, file: 'texto.jpg' }] };
    await expect(processSeedMedia(memoryStore(), dir, broken)).rejects.toThrow(/texto\.jpg/);
  });
});
