import { sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { releases, sites } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { fakeRuntime } from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
import {
  CHECK_RELEASE_IMAGE_TASK,
  listReleases,
  registerRelease,
  requestReleaseImageCheck,
} from '../../src/domain/releases/releases.ts';
import { createCheckReleaseImageTask } from '../../src/jobs/tasks/check-release-image.ts';
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

const settings = { image: 'ghcr.io/orakel-ai-content/site-builder' } as BuildSettings;
const warnings: string[] = [];
const logger = {
  debug() {},
  info() {},
  warn(msg: string) {
    warnings.push(msg);
  },
  error() {},
};
const helpers = { logger, job: { id: '1', attempts: 1 } } as unknown as JobHelpers;
const CHECKED_AT = new Date('2026-11-10T12:00:00Z');

/** Roda a task como o build-runner, com o runtime falso respondendo `imageExists`. */
async function check(tag: string, image: boolean) {
  const asked: string[] = [];
  const { runtime } = fakeRuntime({ image });
  const spy = {
    ...runtime,
    imageExists: (name: string) => {
      asked.push(name);
      return runtime.imageExists(name);
    },
  };
  await createCheckReleaseImageTask({
    db,
    runtime: spy,
    settings,
    now: () => CHECKED_AT.getTime(),
  })({ tag }, helpers);
  return asked;
}

async function checkJobs() {
  // A view `jobs` não expõe o payload; a tabela privada sim.
  const { rows } = await db.execute<{ payload: unknown; key: string | null; max_attempts: number }>(
    sql`
      select j.payload, j.key, j.max_attempts
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${CHECK_RELEASE_IMAGE_TASK}
      order by j.id`,
  );
  return rows;
}

async function release(tag: string) {
  const result = await listReleases(db, SYSTEM_ACTOR);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value.find((r) => r.tag === tag);
}

describe('conferência da imagem da release (#570)', () => {
  beforeEach(() => {
    warnings.length = 0;
  });

  it('registrar enfileira a conferência, e a release fica não conferida até o job rodar', async () => {
    await register(operacao, '1.2.0');

    expect(await checkJobs()).toEqual([
      { payload: { tag: '1.2.0' }, key: 'release-image:1.2.0', max_attempts: 5 },
    ]);
    expect(await release('1.2.0')).toMatchObject({ imageStatus: null, imageCheckedAt: null });
  });

  it('tag recusada não enfileira nada', async () => {
    await register(operacao, '1.2.0');
    await register(operacao, '1.2.0');
    await register(operacao, 'core-v1.3.0');

    expect(await checkJobs()).toHaveLength(1);
  });

  it('imagem fora do host: a release fica ausente, com a data da conferência', async () => {
    await register(operacao, '1.2.0');

    expect(await check('1.2.0', false)).toEqual(['ghcr.io/orakel-ai-content/site-builder:1.2.0']);

    expect(await release('1.2.0')).toMatchObject({
      imageStatus: 'ausente',
      imageCheckedAt: CHECKED_AT,
    });
  });

  it('imagem no host: a release fica disponível', async () => {
    await register(operacao, '1.2.0');

    await check('1.2.0', true);

    expect(await release('1.2.0')).toMatchObject({
      imageStatus: 'disponivel',
      imageCheckedAt: CHECKED_AT,
    });
  });

  it('release não registrada: a task não grava nada e avisa', async () => {
    await check('9.9.9', true);

    expect(await tags()).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining('9.9.9')]);
  });

  it('reconferir enfileira de novo; pedidos antes de o job rodar viram um só', async () => {
    await register(operacao, '1.2.0');
    await check('1.2.0', false);

    expect(await db.transaction((tx) => requestReleaseImageCheck(tx, operacao, '1.2.0'))).toEqual({
      ok: true,
      value: undefined,
    });
    await db.transaction((tx) => requestReleaseImageCheck(tx, SYSTEM_ACTOR, '1.2.0'));

    expect(await checkJobs()).toEqual([expect.objectContaining({ payload: { tag: '1.2.0' } })]);
  });

  it('reconferir recusa tag não registrada com release.not_found', async () => {
    const result = await db.transaction((tx) => requestReleaseImageCheck(tx, operacao, '1.2.0'));

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'release.not_found', path: ['tag'] })],
    });
    expect(await checkJobs()).toEqual([]);
  });

  it.each([editor, revisor])('reconferir recusa $roles com forbidden', async (actor) => {
    await register(operacao, '1.2.0');
    await db.execute(sql`delete from graphile_worker._private_jobs`);

    expect(await db.transaction((tx) => requestReleaseImageCheck(tx, actor, '1.2.0'))).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'forbidden' })],
    });
    expect(await checkJobs()).toEqual([]);
  });
});
