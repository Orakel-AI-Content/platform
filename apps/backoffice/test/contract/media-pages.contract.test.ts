import type { SnapshotLine } from '@orakel/content-model/v1';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { media, mediaUploads, mediaVariants } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { getMediaByIds, listMediaPage } from '../../src/domain/content/media.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Leitura paginada e por IDs da biblioteca de mídia (#180), para a grade do editor.

let db: Db;
let close: () => Promise<void>;
const fixtures: Record<string, SnapshotLine[]> = {};

const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const semPapel: Actor = { email: 'ninguem@orakel.local', roles: [] };
const SITE = 'exemplo-a';

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  for (const site of ['exemplo-a', 'exemplo-b']) fixtures[site] = await readFixture(site);
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  for (const [site, lines] of Object.entries(fixtures)) {
    const imported = await importSnapshot(db, SYSTEM_ACTOR, lines);
    if (!imported.ok) throw new Error(`${site}: ${JSON.stringify(imported.issues)}`);
  }
});

const fixtureMediaIds = (site: string) =>
  (fixtures[site] ?? [])
    .flatMap((line) => (line.type === 'media' ? [line.data.id] : []))
    .sort((a, b) => a - b);

/** Mídias extras no site, com uma variante cada, a partir do ID `first`. */
async function seedMedia(siteId: string, amount: number, first = 1001): Promise<number[]> {
  const ids = Array.from({ length: amount }, (_, index) => first + index);
  await db.insert(media).values(ids.map((id) => ({ siteId, id, width: 800, height: 600 })));
  await db.insert(mediaVariants).values(
    ids.map((id) => ({
      siteId,
      mediaId: id,
      width: 400,
      format: 'webp',
      path: `/media/${id}-400.webp`,
    })),
  );
  return ids;
}

describe('leitura paginada', () => {
  it('páginas na ordem de ID, sem repetir nem pular, com o total do site', async () => {
    const extra = await seedMedia(SITE, 7);
    const all = [...fixtureMediaIds(SITE), ...extra];
    const pageSize = 3;
    const seen: number[] = [];

    for (let page = 1; page <= Math.ceil(all.length / pageSize); page += 1) {
      const result = await listMediaPage(db, revisor, SITE, { page, pageSize });
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      expect(result.value.total).toBe(all.length);
      expect(result.value.items.length).toBeLessThanOrEqual(pageSize);
      for (const item of result.value.items) expect(item.variants.length).toBeGreaterThan(0);
      seen.push(...result.value.items.map((item) => item.id));
    }

    expect(seen).toEqual(all);
  });

  it('página depois da última vem vazia, com o total', async () => {
    const result = await listMediaPage(db, revisor, SITE, { page: 50, pageSize: 10 });

    expect(result).toEqual({
      ok: true,
      value: { items: [], total: fixtureMediaIds(SITE).length },
    });
  });

  it('só as mídias do site pedido', async () => {
    await seedMedia('exemplo-b', 5);
    const result = await listMediaPage(db, revisor, SITE, { page: 1, pageSize: 100 });

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.items.map((item) => item.id)).toEqual(fixtureMediaIds(SITE));
  });

  it.each([
    { page: 0, pageSize: 10 },
    { page: 1.5, pageSize: 10 },
    { page: 1, pageSize: 0 },
    { page: 1, pageSize: 101 },
  ])('recusa página ou tamanho inválidos (%o)', async (input) => {
    const result = await listMediaPage(db, revisor, SITE, input);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'media.page_invalid' }] });
  });

  it('com 2.000 mídias, a primeira página volta em menos de 500 ms', async () => {
    await seedMedia(SITE, 2000);

    const started = performance.now();
    const result = await listMediaPage(db, revisor, SITE, { page: 1, pageSize: 24 });
    const elapsed = performance.now() - started;

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.items).toHaveLength(24);
    expect(result.value.total).toBe(fixtureMediaIds(SITE).length + 2000);
    expect(elapsed).toBeLessThan(500);
  });
});

/** Envio `pronta` ligado a cada mídia, com o nome dado e a data dada. */
async function seedUploads(
  siteId: string,
  entries: readonly { mediaId: number; name: string; at?: Date }[],
): Promise<void> {
  await db.insert(mediaUploads).values(
    entries.map(({ mediaId, name, at }) => ({
      uploadKey: `uploads/${siteId}/${mediaId}.jpg`,
      siteId,
      originalName: name,
      status: 'pronta' as const,
      mediaId,
      ...(at ? { uploadedAt: at } : {}),
    })),
  );
}

describe('nome, data e busca por nome (#186)', () => {
  it('traz o nome original e a data do envio; sem envio registrado, nulos', async () => {
    const [first, second] = await seedMedia(SITE, 2);
    const at = new Date('2026-10-01T15:30:00Z');
    await seedUploads(SITE, [{ mediaId: first ?? 0, name: 'Praia ação 01.jpg', at }]);

    const result = await listMediaPage(db, revisor, SITE, { page: 1, pageSize: 100 });

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const byId = new Map(result.value.items.map((item) => [item.id, item]));
    expect(byId.get(first ?? 0)).toMatchObject({
      originalName: 'Praia ação 01.jpg',
      uploadedAt: at,
    });
    expect(byId.get(second ?? 0)).toMatchObject({ originalName: null, uploadedAt: null });
  });

  it('busca por parte do nome sem diferenciar maiúsculas; mídia sem envio fica de fora', async () => {
    const ids = await seedMedia(SITE, 3);
    await seedUploads(SITE, [
      { mediaId: ids[0] ?? 0, name: 'Praia-Norte.JPG' },
      { mediaId: ids[1] ?? 0, name: 'montanha.png' },
    ]);

    const result = await listMediaPage(db, revisor, SITE, {
      page: 1,
      pageSize: 10,
      search: 'praia',
    });

    expect(result).toMatchObject({
      ok: true,
      value: { total: 1, items: [{ id: ids[0], originalName: 'Praia-Norte.JPG' }] },
    });
  });

  it('% e _ na busca são texto, não curinga', async () => {
    const ids = await seedMedia(SITE, 2);
    await seedUploads(SITE, [
      { mediaId: ids[0] ?? 0, name: 'desconto_50%.jpg' },
      { mediaId: ids[1] ?? 0, name: 'desconto-50.jpg' },
    ]);

    const result = await listMediaPage(db, revisor, SITE, {
      page: 1,
      pageSize: 10,
      search: '_50%',
    });

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.items.map((item) => item.originalName)).toEqual(['desconto_50%.jpg']);
  });

  it('com 2.000 mídias com nome, a primeira página e a busca voltam em menos de 500 ms', async () => {
    const ids = await seedMedia(SITE, 2000);
    await seedUploads(
      SITE,
      ids.map((id) => ({
        mediaId: id,
        name: id % 100 === 0 ? `Promoção ${id}.jpg` : `foto-${id}.jpg`,
      })),
    );

    let started = performance.now();
    const firstPage = await listMediaPage(db, revisor, SITE, { page: 1, pageSize: 24 });
    expect(performance.now() - started).toBeLessThan(500);
    started = performance.now();
    const search = await listMediaPage(db, revisor, SITE, {
      page: 1,
      pageSize: 24,
      search: 'promoção',
    });
    expect(performance.now() - started).toBeLessThan(500);

    if (!firstPage.ok || !search.ok) throw new Error('leitura recusada');
    expect(firstPage.value.items).toHaveLength(24);
    expect(search.value.total).toBe(20);
  });
});

describe('leitura por IDs', () => {
  it('devolve só as mídias do site, em ordem de ID; outro site e inexistentes ficam de fora', async () => {
    const own = fixtureMediaIds(SITE);
    const other = await seedMedia('exemplo-b', 2, 5001);
    const result = await getMediaByIds(db, revisor, SITE, [
      ...[...own].reverse(),
      ...other,
      999_999,
      own[0] ?? 1,
    ]);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.map((item) => item.id)).toEqual(own);
    for (const item of result.value) expect(item.variants.length).toBeGreaterThan(0);
  });

  it('lista vazia devolve vazia; IDs inválidos ou demais são recusados', async () => {
    expect(await getMediaByIds(db, revisor, SITE, [])).toEqual({ ok: true, value: [] });
    for (const ids of [[0], [1.5], Array.from({ length: 101 }, (_, index) => index + 1)]) {
      expect(await getMediaByIds(db, revisor, SITE, ids)).toMatchObject({
        ok: false,
        issues: [{ code: 'media.ids_invalid' }],
      });
    }
  });
});

describe('permissão', () => {
  it('sem site.read, as duas leituras recusam', async () => {
    expect(await listMediaPage(db, semPapel, SITE, { page: 1, pageSize: 10 })).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await getMediaByIds(db, semPapel, SITE, fixtureMediaIds(SITE))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
  });
});

describe('importação com a origem da mídia (seed local)', () => {
  it('guarda o original e registra o envio pronto: a biblioteca mostra nome e data', async () => {
    await resetDatabase(db);
    const [mediaId] = fixtureMediaIds(SITE);
    if (mediaId === undefined) throw new Error('fixture sem mídia');
    const uploadedAt = new Date('2026-08-02T11:03:00.000Z');
    const origins = new Map([
      [
        mediaId,
        { originalKey: `${SITE}/${'ab'.repeat(32)}.jpg`, originalName: 'Horta 01.jpg', uploadedAt },
      ],
    ]);

    const imported = await importSnapshot(db, SYSTEM_ACTOR, fixtures[SITE] ?? [], {
      mediaOrigins: origins,
    });

    expect(imported.ok).toBe(true);
    const stored = await db.select().from(media);
    expect(stored.find((row) => row.id === mediaId)?.originalKey).toBe(
      `${SITE}/${'ab'.repeat(32)}.jpg`,
    );
    const uploads = await db.select().from(mediaUploads);
    expect(uploads).toEqual([
      expect.objectContaining({
        uploadKey: `import/${SITE}/${mediaId}`,
        siteId: SITE,
        status: 'pronta',
        mediaId,
        originalName: 'Horta 01.jpg',
        uploadedAt,
      }),
    ]);
    const page = await listMediaPage(db, revisor, SITE, { page: 1, pageSize: 10 });
    if (!page.ok) throw new Error(JSON.stringify(page.issues));
    expect(page.value.items.find((item) => item.id === mediaId)).toMatchObject({
      originalName: 'Horta 01.jpg',
      uploadedAt,
    });
  });
});
