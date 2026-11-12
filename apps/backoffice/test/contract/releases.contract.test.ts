import { readFile } from 'node:fs/promises';

import { asc, eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { releases, sites } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { fakeRuntime } from '../../src/domain/builds/fake-runtime.ts';
import type { BuildSettings } from '../../src/domain/builds/plan.ts';
import type { ReleaseBump } from '../../src/domain/releases/next-version.ts';
import {
  CHECK_RELEASE_IMAGE_TASK,
  listReleases,
  RELEASE_RUN_TASK,
  requestNewRelease,
  requestReleaseImageCheck,
} from '../../src/domain/releases/releases.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
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

/** Release já registrada (as releases nascem por `requestNewRelease`; o seed vai direto à tabela). */
const seed = async (tag: string, registeredAt?: Date) => {
  await db
    .insert(releases)
    .values({ tag, ...(registeredAt === undefined ? {} : { registeredAt }) });
};

const tags = async () => {
  const result = await listReleases(db, SYSTEM_ACTOR);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value.map(({ tag }) => tag);
};

describe('lista de releases (#509)', () => {
  it('admin e operação listam, da mais recente para a mais antiga', async () => {
    await seed('1.0.0', new Date('2026-01-01T00:00:00Z'));
    await seed('1.1.0', new Date('2026-02-01T00:00:00Z'));

    expect(await tags()).toEqual(['1.1.0', '1.0.0']);
    expect(await listReleases(db, operacao)).toMatchObject({ ok: true });
  });

  it.each([editor, revisor])('recusa $roles com forbidden na lista', async (actor) => {
    expect(await listReleases(db, actor)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'forbidden' })],
    });
  });
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

  it('imagem fora do host: a release fica ausente, com a data da conferência', async () => {
    await seed('1.2.0');

    expect(await check('1.2.0', false)).toEqual(['ghcr.io/orakel-ai-content/site-builder:1.2.0']);

    expect(await release('1.2.0')).toMatchObject({
      imageStatus: 'ausente',
      imageCheckedAt: CHECKED_AT,
    });
  });

  it('imagem no host: a release fica disponível', async () => {
    await seed('1.2.0');

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
    await seed('1.2.0');
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
    await seed('1.2.0');
    await db.execute(sql`delete from graphile_worker._private_jobs`);

    expect(await db.transaction((tx) => requestReleaseImageCheck(tx, actor, '1.2.0'))).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'forbidden' })],
    });
    expect(await checkJobs()).toEqual([]);
  });
});

async function runJobs() {
  const { rows } = await db.execute<{ payload: unknown; key: string | null }>(sql`
    select j.payload, j.key
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${RELEASE_RUN_TASK}
    order by j.id`);
  return rows;
}

const requestNew = (actor: Actor, bump: ReleaseBump) =>
  db.transaction((tx) => requestNewRelease(tx, actor, bump));

describe('gerar nova versão (#658)', () => {
  it('sem releases, cria 0.1.0 em gerando com o solicitante e enfileira o run', async () => {
    const result = await requestNew(operacao, 'patch');

    expect(result).toMatchObject({
      ok: true,
      value: {
        tag: '0.1.0',
        pipelineState: 'gerando',
        requestedBy: 'operacao@exemplo.com',
        runId: null,
        runUrl: null,
        failureReason: null,
        imageStatus: null,
      },
    });
    expect(await release('0.1.0')).toMatchObject({
      pipelineState: 'gerando',
      requestedBy: 'operacao@exemplo.com',
    });
    expect(await runJobs()).toEqual([{ payload: { tag: '0.1.0' }, key: 'release-run:0.1.0' }]);
    expect(await checkJobs()).toEqual([]);
  });

  it.each([
    ['patch', '1.10.1'],
    ['minor', '1.11.0'],
    ['major', '2.0.0'],
  ] as const)(
    '%s parte da maior versão numérica, descartadas inclusive: %s',
    async (bump, expected) => {
      await db
        .insert(releases)
        .values([
          { tag: '1.9.0' },
          { tag: '1.10.0', pipelineState: 'descartada' },
          { tag: '1.2.3' },
        ]);

      expect(await requestNew(SYSTEM_ACTOR, bump)).toMatchObject({
        ok: true,
        value: { tag: expected, pipelineState: 'gerando', requestedBy: 'system' },
      });
    },
  );

  it('releases antigas, cadastradas à mão, ficam disponíveis, sem run nem solicitante', async () => {
    await seed('1.0.0');

    expect(await release('1.0.0')).toMatchObject({
      pipelineState: 'disponivel',
      requestedBy: null,
      runId: null,
    });
    expect(await runJobs()).toEqual([]);
  });

  it.each([editor, revisor])(
    'recusa $roles com forbidden, sem gravar nem enfileirar',
    async (actor) => {
      expect(await requestNew(actor, 'patch')).toEqual({
        ok: false,
        issues: [expect.objectContaining({ code: 'forbidden' })],
      });
      expect(await tags()).toEqual([]);
      expect(await runJobs()).toEqual([]);
    },
  );

  it('recusa um tipo de mudança desconhecido com release.invalid_bump', async () => {
    expect(await requestNew(operacao, 'hotfix' as ReleaseBump)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'release.invalid_bump', path: ['bump'] })],
    });
    expect(await tags()).toEqual([]);
  });

  it('dois pedidos simultâneos: o segundo espera o primeiro e é recusado', async () => {
    await db.insert(releases).values({ tag: '1.2.3' });
    let commitFirst!: () => void;
    const gate = new Promise<void>((resolve) => (commitFirst = resolve));
    let firstDone!: () => void;
    const firstInserted = new Promise<void>((resolve) => (firstDone = resolve));

    const first = db.transaction(async (tx) => {
      const result = await requestNewRelease(tx, operacao, 'patch');
      firstDone();
      await gate;
      return result;
    });
    await firstInserted;
    // O segundo lê as tags sem ver a linha do primeiro e para no insert, preso na chave primária.
    const second = db.transaction((tx) => requestNewRelease(tx, SYSTEM_ACTOR, 'patch'));
    await waitForLockWait();
    commitFirst();

    expect(await first).toMatchObject({ ok: true, value: { tag: '1.2.4' } });
    expect(await second).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'release.version_taken', path: ['bump'] })],
    });
    expect(await tags()).toEqual(['1.2.4', '1.2.3']);
    expect(await runJobs()).toEqual([expect.objectContaining({ payload: { tag: '1.2.4' } })]);
  });
});

/** Espera alguma conexão da suíte ficar bloqueada num lock (o insert do segundo pedido). */
async function waitForLockWait() {
  for (let i = 0; i < 200; i += 1) {
    const { rows } = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`);
    if ((rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('o segundo pedido não chegou a esperar o lock');
}

describe('migração do estado do pipeline (#658)', () => {
  it('só acrescenta colunas, e as linhas existentes ficam disponíveis', async () => {
    const migration = await readFile(
      new URL('../../drizzle/0022_estado_do_pipeline_da_release.sql', import.meta.url),
      'utf8',
    );
    const statements = migration
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER TABLE "releases" ADD COLUMN /);
    }

    // Banco já migrado: volta ao estado anterior (sem as colunas) com uma linha antiga e aplica.
    await db.execute(sql`alter table releases
      drop column pipeline_state, drop column run_id, drop column run_url,
      drop column failure_reason, drop column requested_by`);
    await db.execute(
      sql`insert into releases (tag, image_status, image_checked_at)
          values ('1.0.0', 'ausente', '2026-11-10T12:00:00Z')`,
    );
    for (const statement of statements) await db.execute(sql.raw(statement));

    const { registeredAt, ...migrated } = (await release('1.0.0')) ?? {};
    expect(registeredAt).toBeInstanceOf(Date);
    expect(migrated).toEqual({
      tag: '1.0.0',
      imageStatus: 'ausente',
      imageCheckedAt: new Date('2026-11-10T12:00:00Z'),
      pipelineState: 'disponivel',
      runId: null,
      runUrl: null,
      failureReason: null,
      requestedBy: null,
    });
  });
});
