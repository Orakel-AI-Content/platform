import { readFile } from 'node:fs/promises';

import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { releases, sites } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { listReleases, registerRelease } from '../../src/domain/releases/releases.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(() => resetDatabase(db));

const operacao: Actor = { email: 'operacao@exemplo.com', roles: ['operacao'] };
const editor: Actor = { email: 'editor@exemplo.com', roles: ['editor'] };
const revisor: Actor = { email: 'revisor@exemplo.com', roles: ['revisor'] };

const register = (actor: Actor, tag: string) =>
  db.transaction((tx) => registerRelease(tx, actor, tag));

const tags = async () => {
  const result = await listReleases(db, SYSTEM_ACTOR);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value.map(({ tag }) => tag);
};

describe('registro de releases (#509)', () => {
  it('admin e operação registram; a lista mostra da mais recente para a mais antiga', async () => {
    const first = await register(SYSTEM_ACTOR, '1.0.0');
    expect(first).toMatchObject({ ok: true, value: { tag: '1.0.0' } });
    if (first.ok) expect(first.value.registeredAt).toBeInstanceOf(Date);
    expect(await register(operacao, ' 1.1.0 ')).toMatchObject({
      ok: true,
      value: { tag: '1.1.0' },
    });

    expect(await tags()).toEqual(['1.1.0', '1.0.0']);
    expect(await listReleases(db, operacao)).toMatchObject({ ok: true });
  });

  it('recusa tag repetida com release.exists', async () => {
    await register(operacao, '1.0.0');

    const result = await register(SYSTEM_ACTOR, '1.0.0');

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'release.exists', path: ['tag'] })],
    });
    expect(await tags()).toEqual(['1.0.0']);
  });

  it.each(['site-builder-v1.2.0', 'v1.2.3', '1.2', '1.2.3-rc.1', ''])(
    'recusa %j com release.invalid_tag',
    async (tag) => {
      const result = await register(operacao, tag);

      expect(result).toEqual({
        ok: false,
        issues: [expect.objectContaining({ code: 'release.invalid_tag', path: ['tag'] })],
      });
      expect(await tags()).toEqual([]);
    },
  );

  it.each([editor, revisor])(
    'recusa $roles com forbidden, no cadastro e na lista',
    async (actor) => {
      const forbidden = {
        ok: false,
        issues: [expect.objectContaining({ code: 'forbidden' })],
      };

      expect(await register(actor, '1.0.0')).toEqual(forbidden);
      expect(await listReleases(db, actor)).toEqual(forbidden);
      expect(await tags()).toEqual([]);
    },
  );
});

describe('migração das releases com prefixo core-v (#569)', () => {
  // O setupDatabase já migrou o banco vazio: o teste grava as linhas antigas e roda de novo
  // os comandos da migração, como o db:migrate faria num banco com registros antigos.
  const migrate = async () => {
    const migration = await readFile(
      new URL('../../drizzle/0015_release_sem_prefixo.sql', import.meta.url),
      'utf8',
    );
    for (const statement of migration.split('--> statement-breakpoint')) {
      await db.execute(sql.raw(statement));
    }
  };
  const rows = () =>
    db
      .select({ tag: releases.tag, registeredAt: releases.registeredAt })
      .from(releases)
      .orderBy(asc(releases.tag));
  const siteReleases = async () =>
    (await db.select({ id: sites.id, release: sites.release }).from(sites).orderBy(sites.id)).map(
      ({ id, release }) => [id, release],
    );
  const at = (iso: string) => new Date(iso);

  beforeEach(async () => {
    for (const id of ['exemplo-a', 'exemplo-b']) {
      const line = (await readFixture(id)).find((l) => l.type === 'config');
      if (line?.type !== 'config') throw new Error(`fixture ${id} sem config`);
      await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
    }
  });

  it('tira o prefixo de releases.tag e de sites.release', async () => {
    await db.insert(releases).values([
      { tag: 'core-v1.2.0', registeredAt: at('2026-01-01T00:00:00Z') },
      { tag: '1.3.0', registeredAt: at('2026-02-01T00:00:00Z') },
    ]);
    await db.update(sites).set({ release: 'core-v1.2.0' }).where(eq(sites.id, 'exemplo-a'));

    await migrate();

    expect(await rows()).toEqual([
      { tag: '1.2.0', registeredAt: at('2026-01-01T00:00:00Z') },
      { tag: '1.3.0', registeredAt: at('2026-02-01T00:00:00Z') },
    ]);
    expect(await siteReleases()).toEqual([
      ['exemplo-a', '1.2.0'],
      ['exemplo-b', null],
    ]);
  });

  it.each([
    ['a antiga é a com prefixo', '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z'],
    ['a antiga é a sem prefixo', '2026-03-01T00:00:00Z', '2026-01-01T00:00:00Z'],
  ])(
    'colisão com a mesma versão sem prefixo (%s): fica uma linha, a mais antiga',
    async (_, old, current) => {
      await db.insert(releases).values([
        { tag: 'core-v1.2.0', registeredAt: at(old) },
        { tag: '1.2.0', registeredAt: at(current) },
      ]);

      await migrate();

      expect(await rows()).toEqual([{ tag: '1.2.0', registeredAt: at('2026-01-01T00:00:00Z') }]);
    },
  );

  it('deixa intactos valores sem o prefixo, fora do formato e nulos', async () => {
    await db.insert(releases).values([
      { tag: '1.3.0', registeredAt: at('2026-02-01T00:00:00Z') },
      { tag: 'core-v1.2', registeredAt: at('2026-01-01T00:00:00Z') },
    ]);
    await db.update(sites).set({ release: '1.3.0' }).where(eq(sites.id, 'exemplo-a'));

    await migrate();

    expect(await rows()).toEqual([
      { tag: '1.3.0', registeredAt: at('2026-02-01T00:00:00Z') },
      { tag: 'core-v1.2', registeredAt: at('2026-01-01T00:00:00Z') },
    ]);
    expect(await siteReleases()).toEqual([
      ['exemplo-a', '1.3.0'],
      ['exemplo-b', null],
    ]);
  });

  it('rodar de novo num banco já migrado não muda nada', async () => {
    await db.insert(releases).values([
      { tag: 'core-v1.2.0', registeredAt: at('2026-01-01T00:00:00Z') },
      { tag: '1.2.0', registeredAt: at('2026-03-01T00:00:00Z') },
      { tag: 'core-v1.4.0', registeredAt: at('2026-04-01T00:00:00Z') },
    ]);
    await db.update(sites).set({ release: 'core-v1.4.0' }).where(eq(sites.id, 'exemplo-b'));
    await migrate();
    const first = { releases: await rows(), sites: await siteReleases() };

    await migrate();

    expect({ releases: await rows(), sites: await siteReleases() }).toEqual(first);
    expect(first.sites).toEqual([
      ['exemplo-a', null],
      ['exemplo-b', '1.4.0'],
    ]);
  });
});
