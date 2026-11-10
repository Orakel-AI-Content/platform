import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { listReleases, registerRelease } from '../../src/domain/releases/releases.ts';
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

  it.each(['core-v1.2.0', 'v1.2.3', '1.2', '1.2.3-rc.1', ''])(
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
