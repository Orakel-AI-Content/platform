import { readFile } from 'node:fs/promises';

import { contentPath, mediaUrl } from '@orakel/core/v1';
import { expect, test, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { getDb } from '../../src/db/client.ts';
import { media } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { buildNow } from '../../src/domain/builds/schedule.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { listMedia } from '../../src/domain/content/media.ts';
import { MAX_ORIGINAL_WIDTH } from '../../src/domain/media/ingest.ts';
import { ORIGINALS_BUCKET } from '../../src/domain/media/store.ts';
import { profileVariants } from '../../src/domain/media/variants.ts';
import { currentConfig } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { createS3Client, s3ObjectStore } from '../../src/lib/s3.ts';

// Mídia de ponta a ponta no ambiente local (#53, workspace#18): a foto de 4.000 px com GPS
// enviada pela tela vira original ≤ 2.560 px e variantes sem EXIF em media.<site>.localhost,
// e o artigo publicado (criado pelo domínio, sem o editor) carrega a imagem de lá.
// Precisa do .env.local (banco e S3, pelo playwright.config.ts) e de exemplo-a semeado.

const SITE = 'exemplo-a';
const FIXTURE = new URL('fixtures/foto-gps.jpg', import.meta.url);

test.setTimeout(240_000);
test.afterAll(async () => {
  await getDb().pool.end();
});

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** O EXIF (após "Exif\0\0") aponta para o bloco de GPS: tag 0x8825 na ordem de bytes do TIFF. */
function hasGpsIfd(exif: Buffer): boolean {
  const tiff = exif.subarray(exif.indexOf('Exif\0\0') + 6);
  const tag = tiff.subarray(0, 2).toString() === 'II' ? [0x25, 0x88] : [0x88, 0x25];
  return tiff.includes(Buffer.from(tag));
}

async function maxMediaId(): Promise<number> {
  const listed = await listMedia(getDb().db, SYSTEM_ACTOR, SITE);
  if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
  return Math.max(0, ...listed.value.map((item) => item.id));
}

test('foto com GPS vira variantes sem localização e o artigo publicado a carrega', async ({
  page,
  request,
}) => {
  // A fixture exercita o que se quer provar: 4.000 px e GPS no EXIF.
  const fixture = await readFile(FIXTURE);
  const source = await sharp(fixture).metadata();
  expect(source.width).toBe(4000);
  expect(source.exif && hasGpsIfd(source.exif)).toBe(true);

  // Envio pela tela da biblioteca (#52), como editor, até a mídia aparecer.
  const before = await maxMediaId();
  await loginAs(page, 'editor@orakel.local');
  await page.goto(`/sites/${SITE}/midia`);
  await page.getByLabel(/^Imagem \(JPEG/).setInputFiles(FIXTURE.pathname);
  await page.getByRole('button', { name: 'Enviar imagem' }).click();
  await expect(page.getByRole('status')).toHaveText('Imagem pronta na biblioteca.', {
    timeout: 60_000,
  });

  const { db } = getDb();
  const listed = await listMedia(db, SYSTEM_ACTOR, SITE);
  if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
  const uploaded = listed.value.find((item) => item.id > before);
  if (uploaded === undefined) throw new Error('A mídia enviada não foi registrada');

  // Original guardado: no máximo 2.560 px e sem EXIF (logo, sem localização).
  const [row] = await db
    .select({ originalKey: media.originalKey })
    .from(media)
    .where(and(eq(media.siteId, SITE), eq(media.id, uploaded.id)));
  expect(row?.originalKey).toBeTruthy();
  const store = s3ObjectStore(createS3Client(getEnv()));
  const original = await store.get(ORIGINALS_BUCKET, row?.originalKey ?? '');
  if (original === undefined) throw new Error(`Original ${row?.originalKey} não existe`);
  const originalMeta = await sharp(original).metadata();
  expect(originalMeta.width).toBeLessThanOrEqual(MAX_ORIGINAL_WIDTH);
  expect(originalMeta.exif).toBeUndefined();

  // Todas as variantes do perfil, servidas por media.<site>.localhost, sem EXIF.
  const key = (v: { width: number; format: string }) => `${v.width}/${v.format}`;
  expect(uploaded.variants.map(key).sort()).toEqual(
    profileVariants(uploaded.width).map(key).sort(),
  );
  const config = await currentConfig(db, SITE);
  if (config === undefined) throw new Error(`Site ${SITE} sem configuração`);
  for (const variant of uploaded.variants) {
    const url = mediaUrl(config, variant.path);
    expect(url).toMatch(new RegExp(`^https://media\\.${SITE}\\.localhost/`));
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
    expect((await sharp(await response.body()).metadata()).exif, url).toBeUndefined();
  }

  // Artigo publicado pelo domínio, com a imagem de capa e no corpo; build já.
  const slug = `e2e-midia-${Date.now()}`;
  await db.transaction(async (tx) => {
    const created = await createContent(
      tx,
      SYSTEM_ACTOR,
      SITE,
      {
        kind: 'article',
        slug,
        title: `Artigo ${slug}`,
        description: 'Artigo do E2E da mídia.',
        authorIds: [1],
        taxonomyIds: [1],
        coverMediaId: uploaded.id,
        publishedAt: new Date().toISOString(),
        blocks: [
          {
            new: true,
            type: 'text',
            content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Foto da horta.' }] }],
          },
          {
            new: true,
            type: 'image',
            mediaId: uploaded.id,
            alt: 'Horta com três pés de alface ao sol',
          },
        ],
      },
      { status: 'publicado' },
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));
    await buildNow(tx, SITE);
  });

  const pageUrl = `https://${config.domains[0]}${contentPath({ slug })}`;
  await expect
    .poll(async () => (await request.get(pageUrl)).status(), {
      message: `${pageUrl} publicado`,
      timeout: 150_000,
      intervals: [2_000],
    })
    .toBe(200);

  // A página referencia a imagem por media.<site>.localhost e ela carrega.
  await page.goto(pageUrl);
  const image = page.getByRole('img', { name: 'Horta com três pés de alface ao sol' });
  await image.scrollIntoViewIfNeeded();
  const hash = /\/([0-9a-f]{64})-/.exec(uploaded.variants[0]?.path ?? '')?.[1] ?? '';
  expect(hash).not.toBe('');
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => ({
        src: element.currentSrc,
        loaded: element.complete && element.naturalWidth > 0,
      })),
    )
    .toEqual({
      src: expect.stringMatching(new RegExp(`^https://media\\.${SITE}\\.localhost/.*${hash}`)),
      loaded: true,
    });
});
