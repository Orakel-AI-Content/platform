import type { SnapshotLine } from '@orakel/content-model/v1';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { siteConfigs } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { createAuthor, listAuthors, updateAuthor } from '../../src/domain/content/authors.ts';
import { createMedia, listMedia } from '../../src/domain/content/media.ts';
import { createMenu, listMenus, updateMenu } from '../../src/domain/content/menus.ts';
import {
  createTaxonomy,
  listTaxonomies,
  updateTaxonomy,
} from '../../src/domain/content/taxonomies.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  getInstitutionalTexts,
  unresolvedPendingChangeIds,
  updateInstitutionalTexts,
  updateSiteConfig,
} from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Autores, taxonomias, menus, mídias e textos institucionais (#41).

let db: Db;
let close: () => Promise<void>;
const fixtures: Record<string, SnapshotLine[]> = {};

const editor: Actor = { email: 'editor@orakel.local', roles: ['editor'] };
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const operacao: Actor = { email: 'operacao@orakel.local', roles: ['operacao'] };

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

/** IDs de um tipo de linha na fixture do site. */
const fixtureIds = (site: string, type: 'author' | 'menu' | 'media' | 'taxonomy') =>
  (fixtures[site] ?? [])
    .flatMap((line) => (line.type === type ? [line.data.id] : []))
    .sort((a, b) => a - b);

const tx = <T>(run: (executor: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>) =>
  db.transaction(run);

describe('autores', () => {
  it('edita, registra mudança pendente e apaga o opcional ausente', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');

    expect(
      await tx((t) =>
        updateAuthor(t, editor, 'exemplo-a', 1, { slug: 'ana-souza', name: 'Ana S.' }),
      ),
    ).toEqual({ ok: true, value: undefined });

    const result = await listAuthors(db, editor, 'exemplo-a');
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.find((author) => author.id === 1)).toEqual({
      id: 1,
      slug: 'ana-souza',
      name: 'Ana S.',
    });
    expect((await unresolvedPendingChangeIds(db, 'exemplo-a')).length).toBe(before.length + 1);
  });

  it('slug repetido no site é recusado na edição e no cadastro, sem gravar', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');

    expect(
      await tx((t) =>
        updateAuthor(t, editor, 'exemplo-a', 2, { slug: 'ana-souza', name: 'Bruno' }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'author.slug_exists', path: ['slug'] }] });
    expect(
      await tx((t) => createAuthor(t, editor, 'exemplo-a', { slug: 'ana-souza', name: 'Outra' })),
    ).toMatchObject({ ok: false, issues: [{ code: 'author.slug_exists' }] });
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);

    // Em outro site o slug está livre.
    expect(
      await tx((t) => createAuthor(t, editor, 'exemplo-b', { slug: 'ana-souza', name: 'Ana B' })),
    ).toMatchObject({ ok: true });
  });

  it('schema inválido e autor inexistente são recusados', async () => {
    expect(
      await tx((t) => createAuthor(t, editor, 'exemplo-a', { slug: 'Nao Slug', name: 'X' })),
    ).toMatchObject({ ok: false, issues: [{ code: 'schema.invalid_format', path: ['slug'] }] });
    expect(
      await tx((t) => updateAuthor(t, editor, 'exemplo-a', 999, { slug: 'x', name: 'X' })),
    ).toMatchObject({ ok: false, issues: [{ code: 'author.not_found' }] });
  });
});

describe('taxonomias', () => {
  it('slug é único dentro do tipo, não entre tipos', async () => {
    // Tag 2 com o slug da categoria 1: tipos diferentes, aceito.
    expect(
      await tx((t) =>
        updateTaxonomy(t, editor, 'exemplo-a', 2, { kind: 'tag', slug: 'guias', name: 'Guias' }),
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await tx((t) =>
        createTaxonomy(t, editor, 'exemplo-a', { kind: 'category', slug: 'guias', name: 'Outra' }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'taxonomy.slug_exists' }] });
    expect(
      await tx((t) =>
        updateTaxonomy(t, editor, 'exemplo-a', 999, { kind: 'tag', slug: 'x', name: 'X' }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'taxonomy.not_found' }] });
  });

  it('lista por tipo, só do site pedido', async () => {
    const tags = await listTaxonomies(db, editor, 'exemplo-a', 'tag');
    if (!tags.ok) throw new Error(JSON.stringify(tags.issues));
    expect(tags.value.map((taxonomy) => [taxonomy.id, taxonomy.kind])).toEqual([[2, 'tag']]);

    const all = await listTaxonomies(db, editor, 'exemplo-b');
    if (!all.ok) throw new Error(JSON.stringify(all.issues));
    expect(all.value.map((taxonomy) => taxonomy.id)).toEqual(fixtureIds('exemplo-b', 'taxonomy'));
  });
});

describe('menus', () => {
  it('edita os itens e recusa key repetida', async () => {
    const items = [{ label: 'Início', href: '/' }];
    expect(
      await tx((t) => updateMenu(t, editor, 'exemplo-a', 1, { key: 'principal', items })),
    ).toEqual({ ok: true, value: undefined });
    const menus = await listMenus(db, editor, 'exemplo-a');
    expect(menus).toEqual({ ok: true, value: [{ id: 1, key: 'principal', items }] });

    expect(
      await tx((t) => createMenu(t, editor, 'exemplo-a', { key: 'principal', items })),
    ).toMatchObject({ ok: false, issues: [{ code: 'menu.key_exists', path: ['key'] }] });
    expect(
      await tx((t) => updateMenu(t, editor, 'exemplo-a', 999, { key: 'rodape', items })),
    ).toMatchObject({ ok: false, issues: [{ code: 'menu.not_found' }] });
  });
});

describe('listas por site', () => {
  it.each(['exemplo-a', 'exemplo-b'])('%s: autores, menus e mídias só do site', async (site) => {
    const authors = await listAuthors(db, revisor, site);
    const menus = await listMenus(db, revisor, site);
    const media = await listMedia(db, revisor, site);
    if (!authors.ok || !menus.ok || !media.ok) throw new Error('leitura recusada');

    expect(authors.value.map((author) => author.id)).toEqual(fixtureIds(site, 'author'));
    expect(menus.value.map((menu) => menu.id)).toEqual(fixtureIds(site, 'menu'));
    expect(media.value.map((item) => item.id)).toEqual(fixtureIds(site, 'media'));
    for (const item of media.value) expect(item.variants.length).toBeGreaterThan(0);
  });
});

describe('mídias', () => {
  const variants = (widths: number[]) =>
    widths.flatMap((width) =>
      ['avif', 'webp'].map((format) => ({
        width,
        format,
        path: `exemplo-a/f00d-${width}.${format}`,
      })),
    );

  it('registra mídia de 800 px só com as variantes que cabem no original', async () => {
    const created = await tx((t) =>
      createMedia(t, editor, 'exemplo-a', {
        width: 800,
        height: 600,
        variants: variants([320, 640]),
      }),
    );
    expect(created.ok).toBe(true);
  });

  it('recusa variantes que não cobrem o perfil exigido, sem gravar', async () => {
    const before = await listMedia(db, revisor, 'exemplo-a');
    const created = await tx((t) =>
      createMedia(t, editor, 'exemplo-a', { width: 2560, height: 1440, variants: variants([320]) }),
    );
    expect(created.ok ? [] : [...new Set(created.issues.map((issue) => issue.code))]).toEqual([
      'semantic.supported-resources',
    ]);
    expect(await listMedia(db, revisor, 'exemplo-a')).toEqual(before);
  });
});

describe('textos institucionais', () => {
  const configs = () =>
    db
      .select({ version: siteConfigs.version, config: siteConfigs.config })
      .from(siteConfigs)
      .where(eq(siteConfigs.siteId, 'exemplo-a'))
      .orderBy(asc(siteConfigs.version));
  const about = [
    {
      type: 'paragraph' as const,
      children: [{ type: 'text' as const, text: 'Quem somos, novo.' }],
    },
  ];

  it('editor grava a versão N+1, idêntica à N exceto nos textos', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');

    const result = await tx((t) => updateInstitutionalTexts(t, editor, 'exemplo-a', { about }));

    expect(result).toEqual({ ok: true, value: { version: 2 } });
    const [v1, v2] = await configs();
    expect(v2?.config.institutionalTexts).toEqual({ about });
    expect(v2?.config).toEqual({ ...v1?.config, institutionalTexts: { about } });
    expect((await unresolvedPendingChangeIds(db, 'exemplo-a')).length).toBe(before.length + 1);
  });

  it('editor não altera outros campos; textos inválidos não gravam', async () => {
    const [v1] = await configs();
    if (v1 === undefined) throw new Error('sem configuração');

    expect(
      await tx((t) =>
        updateSiteConfig(t, editor, 'exemplo-a', { ...v1.config, name: 'Outro nome' }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(
      await tx((t) =>
        updateInstitutionalTexts(t, editor, 'exemplo-a', { about: 'texto solto' } as never),
      ),
    ).toMatchObject({ ok: false, issues: [{ path: ['institutionalTexts', 'about'] }] });
    expect(await configs()).toHaveLength(1);
  });

  it('a leitura devolve os textos da versão mais recente; sem papel, forbidden', async () => {
    await tx((t) => updateInstitutionalTexts(t, editor, 'exemplo-a', { about }));

    expect(await getInstitutionalTexts(db, revisor, 'exemplo-a')).toEqual({
      ok: true,
      value: { about },
    });
    expect(await getInstitutionalTexts(db, editor, 'nao-existe')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
    expect(
      await getInstitutionalTexts(db, { email: 'x@orakel.local', roles: [] }, 'exemplo-a'),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });
});

describe('permissões', () => {
  it.each([
    ['revisor', revisor],
    ['operação', operacao],
  ])('%s recebe forbidden em todas as gravações', async (_, actor) => {
    const items = [{ label: 'Início', href: '/' }];
    const writes = [
      tx((t) => createAuthor(t, actor, 'exemplo-a', { slug: 'novo', name: 'Novo' })),
      tx((t) => updateAuthor(t, actor, 'exemplo-a', 1, { slug: 'ana-souza', name: 'X' })),
      tx((t) => createTaxonomy(t, actor, 'exemplo-a', { kind: 'tag', slug: 'nova', name: 'N' })),
      tx((t) =>
        updateTaxonomy(t, actor, 'exemplo-a', 1, { kind: 'category', slug: 'guias', name: 'G' }),
      ),
      tx((t) => createMenu(t, actor, 'exemplo-a', { key: 'rodape', items })),
      tx((t) => updateMenu(t, actor, 'exemplo-a', 1, { key: 'principal', items })),
      tx((t) => updateInstitutionalTexts(t, actor, 'exemplo-a', {})),
    ];
    for (const result of await Promise.all(writes)) {
      expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    }
  });
});
