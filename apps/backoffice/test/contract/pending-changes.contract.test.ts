import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { pendingChanges, siteConfigs, sites } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { advanceLifecycle } from '../../src/domain/builds/site-state.ts';
import { createAuthor } from '../../src/domain/content/authors.ts';
import { createContent } from '../../src/domain/content/contents.ts';
import { listPendingChanges } from '../../src/domain/pending-changes/list.ts';
import {
  createSite,
  unresolvedPendingChangeIds,
  updateSiteConfig,
} from '../../src/domain/sites/sites.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;
let config: Parameters<typeof createSite>[2];

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
  const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
  if (line?.type !== 'config') throw new Error('fixture sem config');
  config = line.data;
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, config));
});

const author = { slug: 'ana', name: 'Ana' };

describe('recordPendingChange', () => {
  it('grava junto com a transação e some com o rollback', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-b');
    await db
      .transaction(async (tx) => {
        await createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author);
        throw new Error('desfaz');
      })
      .catch(() => undefined);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-b')).toEqual(before);

    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author));
    expect((await unresolvedPendingChangeIds(db, 'exemplo-b')).length).toBe(before.length + 1);
  });

  it('sem permissão, nada é gravado', async () => {
    const editor = { email: 'r@orakel.local', roles: ['revisor'] as const };
    const result = await db.transaction((tx) => createAuthor(tx, editor, 'exemplo-b', author));
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });

  it('REPEATABLE READ: mudança confirmada depois do snapshot fica de fora e continua pendente', async () => {
    let seenInside: number[] = [];
    await db.transaction(
      async (tx) => {
        await tx.execute(sql`select 1`); // fixa o snapshot da transação
        await db.transaction((other) => createAuthor(other, SYSTEM_ACTOR, 'exemplo-b', author));
        seenInside = await unresolvedPendingChangeIds(tx, 'exemplo-b');
      },
      { isolationLevel: 'repeatable read' },
    );
    const seenAfter = await unresolvedPendingChangeIds(db, 'exemplo-b');
    expect(seenAfter.length).toBe(seenInside.length + 1);
  });
});

describe('listPendingChanges (#99)', () => {
  it('lista só as não resolvidas do site pedido, da mais recente para a mais antiga', async () => {
    const other = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
    if (other?.type !== 'config') throw new Error('fixture sem config');
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, other.data));
    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author));
    await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', { ...config, name: 'Receitas B' }),
    );
    // O build baixou a criação do site (config v1): fica fora da lista.
    await db
      .update(pendingChanges)
      .set({ resolvedAt: new Date() })
      .where(eq(pendingChanges.reference, 'v1'));

    const result = await listPendingChanges(db, SYSTEM_ACTOR, 'exemplo-b');

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.map(({ origin, reference }) => ({ origin, reference }))).toEqual([
      { origin: 'config', reference: 'v2' },
      { origin: 'author', reference: '1' },
    ]);
    expect(result.value.map((change) => change.id)).toEqual(
      (await unresolvedPendingChangeIds(db, 'exemplo-b')).toReversed(),
    );
    expect(result.value[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('sem site.read, recusa', async () => {
    const result = await listPendingChanges(
      db,
      { email: 'x@orakel.local', roles: [] },
      'exemplo-b',
    );
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });
});

describe('IDs por site', () => {
  it('são sequenciais, nunca reutilizados, e respeitam IDs importados', async () => {
    const first = await db.transaction((tx) =>
      createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author, { id: 7 }),
    );
    const next = await db.transaction((tx) =>
      createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', { slug: 'bia', name: 'Bia' }),
    );
    expect(first).toEqual({ ok: true, value: { id: 7 } });
    expect(next).toEqual({ ok: true, value: { id: 8 } });
  });

  it('o próximo número de bloco fica acima do maior n usado', async () => {
    await db.transaction((tx) =>
      createContent(tx, SYSTEM_ACTOR, 'exemplo-b', {
        kind: 'page',
        slug: 'p',
        title: 'P',
        authorIds: [],
        taxonomyIds: [],
        publishedAt: '2026-09-29T12:00:00-03:00',
        blocks: [
          { n: 1, type: 'toc' },
          { n: 4, type: 'toc' },
        ],
      }),
    );
    const [row] = (
      await db.execute(sql`select next_block_n from contents where site_id = 'exemplo-b'`)
    ).rows;
    expect(row).toEqual({ next_block_n: 5 });
  });
});

describe('editar configuração', () => {
  const versions = () =>
    db
      .select({ version: siteConfigs.version, config: siteConfigs.config })
      .from(siteConfigs)
      .where(eq(siteConfigs.siteId, 'exemplo-b'))
      .orderBy(siteConfigs.version);

  it('grava a versão N+1, mantém a N e registra a mudança pendente', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-b');
    const result = await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', { ...config, name: 'Receitas B' }),
    );

    expect(result).toEqual({ ok: true, value: { version: 2 } });
    const rows = await versions();
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0]?.config).toEqual(config);
    expect(rows[1]?.config.name).toBe('Receitas B');
    expect((await unresolvedPendingChangeIds(db, 'exemplo-b')).length).toBe(before.length + 1);
    const [site] = await db.select({ name: sites.name }).from(sites);
    expect(site?.name).toBe('Receitas B');
  });

  it('mantém os textos institucionais da versão corrente', async () => {
    const withoutTexts = { ...config };
    delete withoutTexts.institutionalTexts;
    await db.transaction((tx) => updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', withoutTexts));
    await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', {
        ...config,
        institutionalTexts: { about: [] },
      }),
    );

    const rows = await versions();
    expect(rows.map((row) => row.config.institutionalTexts)).toEqual([
      config.institutionalTexts,
      config.institutionalTexts,
      config.institutionalTexts,
    ]);
  });

  it.each([
    ['preset fora dos recursos', () => ({ presets: { ...config.presets, home: 'inexistente' } })],
    ['variante fora dos recursos', () => ({ variants: { articleCard: 'inexistente' } })],
  ])('recusa %s sem gravar nada', async (_, change) => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-b');
    const result = await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', { ...config, ...change() }),
    );

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'semantic.supported-resources' }],
    });
    expect((await versions()).length).toBe(1);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-b')).toEqual(before);
  });

  it('recusa trocar o SITE_ID e site inexistente', async () => {
    expect(
      await db.transaction((tx) =>
        updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', { ...config, siteId: 'outro' }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.id_mismatch' }] });
    expect(
      await db.transaction((tx) =>
        updateSiteConfig(tx, SYSTEM_ACTOR, 'outro', { ...config, siteId: 'outro' }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
    expect((await versions()).length).toBe(1);
  });
});

describe('ciclo de vida', () => {
  const lifecycle = async () =>
    (await db.select({ lifecycle: sites.lifecycle }).from(sites))[0]?.lifecycle;

  it('marca infra_aplicada e zona_ativa em ordem, sem mudança pendente', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-b');
    for (const step of ['infra_aplicada', 'zona_ativa'] as const) {
      expect(
        await db.transaction((tx) => advanceLifecycle(tx, SYSTEM_ACTOR, 'exemplo-b', step)),
      ).toEqual({ ok: true, value: undefined });
      expect(await lifecycle()).toBe(step);
    }
    expect(await unresolvedPendingChangeIds(db, 'exemplo-b')).toEqual(before);
  });

  it('recusa fora da ordem, com o motivo', async () => {
    const result = await db.transaction((tx) =>
      advanceLifecycle(tx, SYSTEM_ACTOR, 'exemplo-b', 'zona_ativa'),
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'site.lifecycle_order',
          message:
            'zona_ativa só pode ser marcada a partir de infra_aplicada; o site está em cadastrado',
        },
      ],
    });

    await db.transaction((tx) => advanceLifecycle(tx, SYSTEM_ACTOR, 'exemplo-b', 'infra_aplicada'));
    expect(
      await db.transaction((tx) =>
        advanceLifecycle(tx, SYSTEM_ACTOR, 'exemplo-b', 'infra_aplicada'),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.lifecycle_order' }] });
    expect(await lifecycle()).toBe('infra_aplicada');
  });

  it('recusa site inexistente', async () => {
    expect(
      await db.transaction((tx) => advanceLifecycle(tx, SYSTEM_ACTOR, 'outro', 'infra_aplicada')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });
});

describe('permissões da configuração', () => {
  it.each(['editor', 'revisor'] as const)(
    '%s não edita a configuração nem marca etapas',
    async (role) => {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(
        await db.transaction((tx) => updateSiteConfig(tx, actor, 'exemplo-b', config)),
      ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
      expect(
        await db.transaction((tx) => advanceLifecycle(tx, actor, 'exemplo-b', 'infra_aplicada')),
      ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
      const [site] = await db.select({ lifecycle: sites.lifecycle }).from(sites);
      expect(site?.lifecycle).toBe('cadastrado');
    },
  );
});
