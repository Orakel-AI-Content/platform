import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
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
import { removeSites } from './cleanup.ts';
import { createVolumeSite, seedMedia } from '../volume.ts';

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

// Com a biblioteca vazia, "Enviar imagens" aparece no cabeçalho e no `EmptyState` (#377): o E2E
// usa o primeiro, o do cabeçalho.

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** O EXIF (após "Exif\0\0") aponta para o bloco de GPS: tag 0x8825 na ordem de bytes do TIFF. */
/** Diálogo "Enviar imagens" (#376) e o campo de arquivo da área de soltar, nomeado pelo texto. */
function uploadDialog(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Enviar imagens' });
  return { dialog, input: dialog.getByLabel(/^Solte as imagens aqui/) };
}

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
  // Soltar na área do diálogo (#376): o arrasto destaca a área, e o arquivo solto cai no campo
  // que a cobre (o Playwright não solta arquivos do sistema; `setInputFiles` faz a parte dele).
  await page.getByRole('button', { name: 'Enviar imagens' }).first().click();
  const upload = uploadDialog(page);
  const dragged = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['x'], 'foto-gps.jpg', { type: 'image/jpeg' }));
    return transfer;
  });
  await upload.input.dispatchEvent('dragover', { dataTransfer: dragged });
  await expect(upload.dialog.locator('.upload-draggable')).toHaveClass(/border-primary/);
  await upload.input.dispatchEvent('drop', { dataTransfer: dragged });
  await upload.input.setInputFiles(FIXTURE.pathname);
  await expect(upload.dialog).toBeHidden();
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

const BIG_SITE = `e2e-biblioteca-${Date.now()}`;

/**
 * Site novo com `count` mídias, gravado direto no banco: cada uma com o envio que a gerou,
 * "Promoção <id>.jpg" a cada `promoEvery` e "foto-<id>.jpg" nas demais.
 */
async function seedLibrarySite(siteId: string, count: number, promoEvery: number) {
  const { db } = getDb();
  await createVolumeSite(db, siteId);
  await seedMedia(db, siteId, { count, promoEvery });
}

// Só no projeto `perf` (CI ou E2E_PERF=1, #461): o tempo no navegador depende da carga da
// máquina. A consulta com volume é medida no contrato.
test.describe('biblioteca com 2.000 imagens (#186)', { tag: '@perf' }, () => {
  test.beforeAll(() => seedLibrarySite(BIG_SITE, 2000, 100));

  test.afterAll(async () => {
    await removeSites([BIG_SITE]);
  });

  test('abre e busca em menos de 2 s', async ({ page }) => {
    await loginAs(page, 'editor@orakel.local');
    const count = page.getByRole('status').filter({ hasText: /resultados?$/ });

    let started = Date.now();
    await page.goto(`/sites/${BIG_SITE}/midia`);
    await expect(count).toHaveText('2.000 resultados');
    expect(Date.now() - started).toBeLessThan(2000);

    started = Date.now();
    await page.getByRole('searchbox', { name: 'Buscar por nome do arquivo' }).fill('PROMO');
    await expect(count).toHaveText('20 resultados');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

const LIBRARY_SITE = `e2e-biblioteca-lista-${Date.now()}`;

// Biblioteca com mais de uma página (#186), num site pequeno: 30 mídias, 3 "Promoção".
test.describe('biblioteca de mídia (#186)', () => {
  test.beforeAll(() => seedLibrarySite(LIBRARY_SITE, 30, 10));

  test.afterAll(async () => {
    await removeSites([LIBRARY_SITE]);
  });

  test('busca por nome e pagina só com teclado, com a busca na URL', async ({ page }) => {
    await loginAs(page, 'editor@orakel.local');
    // A contagem fica ao lado do nav "Paginação" do Ecme, não dentro dele (#269).
    const count = page.getByRole('status').filter({ hasText: /resultados?$/ });

    await page.goto(`/sites/${LIBRARY_SITE}/midia`);
    await expect(count).toHaveText('30 resultados');
    await expect(page.getByText('foto-1.jpg ·', { exact: false })).toBeVisible();

    const searchBox = page.getByRole('searchbox', { name: 'Buscar por nome do arquivo' });
    for (let step = 0; step < 60; step += 1) {
      if (await searchBox.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(searchBox).toBeFocused();
    // Maiúsculas ASCII: o ilike não depende da collation do banco para elas.
    await page.keyboard.type('PROMO');
    await expect(count).toHaveText('3 resultados');
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

  // "Copiar identificador" no retorno padrão (#326): o toast fica fora da app que o diálogo
  // deixa inerte e é anunciado com ele aberto; no tema claro. O cabeçalho é o nativo do Dialog
  // (#374): o nome num `h4` e um X "Fechar" só, que fecha e devolve o foco à imagem.
  test(`copiar o identificador com o diálogo aberto confirma no toast`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${LIBRARY_SITE}/midia`);
    const image = page.getByRole('button', { name: /^foto-1\.jpg ·/ });
    await image.click();
    const details = page.getByRole('dialog', { name: 'foto-1.jpg' });
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { level: 4 })).toHaveText('foto-1.jpg');
    await expect(details.getByRole('button', { name: 'Fechar' })).toHaveCount(1);

    await details.getByRole('button', { name: 'Copiar identificador' }).click();
    const toast = page.locator('[data-toast-placement="top-end"]');
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast).toContainText('Identificador copiado.');
    await expect(details).toBeVisible();
    await expect(details.getByRole('alert')).toHaveText('');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    await expect(details.locator('dd.tabular-nums')).toHaveText(copied);

    await page.mouse.move(0, 0);
    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(accessibility.violations).toEqual([]);

    await details.getByRole('button', { name: 'Fechar' }).click();
    await expect(details).toBeHidden();
    await expect(image).toBeFocused();
  });

  // Busca, contagem e paginação nos controles do Ecme (#269), no tema claro.
  test(`lista sem violação do axe`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${LIBRARY_SITE}/midia?pagina=2`);
    await expect(page.getByRole('status').filter({ hasText: /resultados?$/ })).toHaveText(
      '30 resultados',
    );
    await expect(
      page
        .getByRole('navigation', { name: 'Paginação' })
        .getByRole('button', { name: 'Página 2', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.waitForLoadState('networkidle');

    const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(accessibility.violations).toEqual([]);
  });
});

test(
  'envia 3 arquivos de uma vez: 2 ficam prontos e o inválido é recusado com o motivo (#188)',
  { tag: '@smoke' },
  async ({ page }) => {
    const small = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#2a9d8f' },
    })
      .jpeg()
      .toBuffer();
    await loginAs(page, 'editor@orakel.local');
    await page.goto(`/sites/${SITE}/midia`);

    // Só com teclado (#376): Enter no botão abre o diálogo; Tab passa pelo X "Fechar" e chega ao
    // campo que cobre a área; Enter nele abre o seletor de arquivos do navegador. Escolher fecha o
    // diálogo e o foco volta ao botão.
    const trigger = page.getByRole('button', { name: 'Enviar imagens' }).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const upload = uploadDialog(page);
    await expect(upload.dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(upload.dialog.getByRole('button', { name: 'Fechar' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(upload.input).toBeFocused();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (
      await chooser
    ).setFiles([
      { name: 'foto-gps.jpg', mimeType: 'image/jpeg', buffer: await readFile(FIXTURE) },
      { name: 'paisagem.jpg', mimeType: 'image/jpeg', buffer: small },
      { name: 'notas.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('não é imagem') },
    ]);
    await expect(upload.dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    const row = (name: string) =>
      page.getByRole('list', { name: 'Envios' }).getByRole('listitem').filter({ hasText: name });
    await expect(row('notas.jpg')).toContainText(
      'recusada: O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
    );
    await expect(row('foto-gps.jpg')).toContainText('pronta', { timeout: 60_000 });
    await expect(row('paisagem.jpg')).toContainText('pronta', { timeout: 60_000 });
  },
);

// Fila de envio nos tokens do Ecme (#281): um envio pronto e um recusado, no tema claro, com
// um único `role="status"` para a fila (#375), e o diálogo de envio aberto (#376).
test(`fila de envio preenchida sem violação do axe`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const small = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#e76f51' },
  })
    .jpeg()
    .toBuffer();
  await loginAs(page, 'editor@orakel.local');
  await page.goto(`/sites/${SITE}/midia`);

  await page.getByRole('button', { name: 'Enviar imagens' }).first().click();
  const upload = uploadDialog(page);
  await expect(upload.dialog).toBeVisible();
  const dialogAccessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(dialogAccessibility.violations).toEqual([]);

  await upload.input.setInputFiles([
    { name: `axe-light.jpg`, mimeType: 'image/jpeg', buffer: small },
    { name: 'notas.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('não é imagem') },
  ]);
  await expect(upload.dialog).toBeHidden();

  const row = (name: string) =>
    page.getByRole('list', { name: 'Envios' }).getByRole('listitem').filter({ hasText: name });
  await expect(row('notas.jpg')).toContainText('recusada: ');
  await expect(row(`axe-light.jpg`)).toContainText('pronta', { timeout: 60_000 });
  // Um anúncio só para a fila, com o resumo; as linhas não têm região própria (#375).
  await expect(page.getByRole('status').filter({ hasText: /^2 envios: / })).toHaveText(
    '2 envios: 1 pronta, 1 recusada',
  );
  await expect(page.getByRole('list', { name: 'Envios' }).getByRole('status')).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accessibility.violations).toEqual([]);
});
