import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { contentPath, mediaUrl } from '@orakel/core/v1';
import { expect, test, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';

import { getDb } from '../../src/db/client.ts';
import { media, mediaUploads, mediaVariants } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { buildNow } from '../../src/domain/builds/schedule.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { listMedia } from '../../src/domain/content/media.ts';
import { MAX_ORIGINAL_WIDTH } from '../../src/domain/media/ingest.ts';
import { ORIGINALS_BUCKET } from '../../src/domain/media/store.ts';
import { profileVariants } from '../../src/domain/media/variants.ts';
import { createSite, currentConfig } from '../../src/domain/sites/sites.ts';
import { getEnv } from '../../src/env.ts';
import { createS3Client, s3ObjectStore } from '../../src/lib/s3.ts';
import { removeSites } from './cleanup.ts';
import { analyzeTables } from './statistics.ts';

// Mídia de ponta a ponta no ambiente local (#53, workspace#18): a foto de 4.000 px com GPS
// enviada pela tela vira original ≤ 2.560 px e variantes sem EXIF em media.<site>.localhost,
// e o artigo publicado (criado pelo domínio, sem o editor) carrega a imagem de lá.
// Precisa do .env.local (banco e S3, pelo playwright.config.ts) e de exemplo-a semeado.

const SITE = 'exemplo-a';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];
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
  await page.getByLabel(/^Imagens \(JPEG/).setInputFiles(FIXTURE.pathname);
  await page.getByRole('button', { name: 'Enviar imagens' }).click();
  // Cada arquivo tem a sua linha na fila de envio (#188).
  await expect(
    page
      .getByRole('list', { name: 'Envios' })
      .getByRole('listitem')
      .filter({ hasText: 'foto-gps.jpg' }),
  ).toContainText('pronta', { timeout: 60_000 });

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

const LIBRARY_SITE = `e2e-biblioteca-${Date.now()}`;
const LIBRARY_COUNT = 2000;

test.describe('biblioteca com 2.000 imagens (#186)', () => {
  test.beforeAll(async () => {
    const config = (await readFixture('exemplo-b')).find((line) => line.type === 'config');
    if (config?.type !== 'config') throw new Error('fixture sem config');
    const { db } = getDb();
    const site = await db.transaction((tx) =>
      createSite(tx, SYSTEM_ACTOR, {
        ...config.data,
        siteId: LIBRARY_SITE,
        name: `Site ${LIBRARY_SITE}`,
        domains: [`${LIBRARY_SITE}.example.com`],
      }),
    );
    if (!site.ok) throw new Error(JSON.stringify(site.issues));
    const ids = Array.from({ length: LIBRARY_COUNT }, (_, index) => index + 1);
    await db.transaction(async (tx) => {
      await tx
        .insert(media)
        .values(ids.map((id) => ({ siteId: LIBRARY_SITE, id, width: 800, height: 600 })));
      await tx.insert(mediaVariants).values(
        ids.map((id) => ({
          siteId: LIBRARY_SITE,
          mediaId: id,
          width: 400,
          format: 'webp',
          path: `${LIBRARY_SITE}/h${id}-400.webp`,
        })),
      );
      // A cada 100, "Promoção": a busca acha 20.
      await tx.insert(mediaUploads).values(
        ids.map((id) => ({
          uploadKey: `uploads/${LIBRARY_SITE}/${id}.jpg`,
          siteId: LIBRARY_SITE,
          originalName: id % 100 === 0 ? `Promoção ${id}.jpg` : `foto-${id}.jpg`,
          status: 'pronta' as const,
          mediaId: id,
        })),
      );
    });
    await analyzeTables(db, media, mediaVariants, mediaUploads);
  });

  test.afterAll(async () => {
    await removeSites([LIBRARY_SITE]);
  });

  test('abre e busca por nome em menos de 2 s, só com teclado, com a busca na URL', async ({
    page,
  }) => {
    await loginAs(page, 'editor@orakel.local');
    // A contagem fica ao lado do nav "Paginação" do Ecme, não dentro dele (#269).
    const count = page.getByRole('status').filter({ hasText: /resultados?$/ });

    let started = Date.now();
    await page.goto(`/sites/${LIBRARY_SITE}/midia`);
    await expect(count).toHaveText('2.000 resultados');
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(page.getByText('foto-1.jpg ·', { exact: false })).toBeVisible();

    const searchBox = page.getByRole('searchbox', { name: 'Buscar por nome do arquivo' });
    for (let step = 0; step < 60; step += 1) {
      if (await searchBox.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(searchBox).toBeFocused();
    started = Date.now();
    // Maiúsculas ASCII: o ilike não depende da collation do banco para elas.
    await page.keyboard.type('PROMO');
    await expect(count).toHaveText('20 resultados');
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(page).toHaveURL(/[?&]q=PROMO/);

    // A paginação também só com teclado, sem repetir imagem.
    await page.goto(`/sites/${LIBRARY_SITE}/midia`);
    const next = page.getByRole('button', { name: 'Próxima página' });
    for (let step = 0; step < 80; step += 1) {
      if (await next.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]pagina=2/);
    await expect(page.getByText('foto-25.jpg ·', { exact: false })).toBeVisible();
    await expect(page.getByText('foto-24.jpg ·', { exact: false })).toHaveCount(0);
  });

  // Busca, contagem e paginação nos controles do Ecme (#269), nos dois temas.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`lista sem violação do axe (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await loginAs(page, 'editor@orakel.local');
      await page.goto(`/sites/${LIBRARY_SITE}/midia?pagina=2`);
      await expect(page.getByRole('status').filter({ hasText: /resultados?$/ })).toHaveText(
        '2.000 resultados',
      );
      await expect(
        page
          .getByRole('navigation', { name: 'Paginação' })
          .getByRole('button', { name: 'Página 2' }),
      ).toHaveAttribute('aria-current', 'page');
      await page.waitForLoadState('networkidle');

      const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(accessibility.violations).toEqual([]);
    });
  }
});

test('envia 3 arquivos de uma vez: 2 ficam prontos e o inválido é recusado com o motivo (#188)', async ({
  page,
}) => {
  const small = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#2a9d8f' },
  })
    .jpeg()
    .toBuffer();
  await loginAs(page, 'editor@orakel.local');
  await page.goto(`/sites/${SITE}/midia`);

  // Só com teclado: o campo de arquivos e o botão, sem arrastar.
  const input = page.getByLabel(/^Imagens \(JPEG/);
  await input.setInputFiles([
    { name: 'foto-gps.jpg', mimeType: 'image/jpeg', buffer: await readFile(FIXTURE) },
    { name: 'paisagem.jpg', mimeType: 'image/jpeg', buffer: small },
    { name: 'notas.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('não é imagem') },
  ]);
  await input.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enviar imagens' })).toBeFocused();
  await page.keyboard.press('Enter');

  const row = (name: string) =>
    page.getByRole('list', { name: 'Envios' }).getByRole('listitem').filter({ hasText: name });
  await expect(row('notas.jpg')).toContainText(
    'recusada: O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
  );
  await expect(row('foto-gps.jpg')).toContainText('pronta', { timeout: 60_000 });
  await expect(row('paisagem.jpg')).toContainText('pronta', { timeout: 60_000 });
});
