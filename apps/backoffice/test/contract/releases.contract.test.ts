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
  discardRelease,
  listReleases,
  RELEASE_RUN_TASK,
  requestNewRelease,
  requestReleaseImageCheck,
  retryRelease,
  type ReleasePipelineState,
} from '../../src/domain/releases/releases.ts';
import { createSite } from '../../src/domain/sites/sites.ts';
import { createCheckReleaseImageTask } from '../../src/jobs/tasks/check-release-image.ts';
import { createReleaseRunTask, RELEASE_POLL_MS } from '../../src/jobs/tasks/release-run.ts';
import type { GitHubClient, WorkflowRun } from '../../src/lib/github.ts';
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
const IMAGE = 'ghcr.io/orakel-ai-content/site-builder:1.2.0';

/** Leva a release semeada a um estado do pipeline (o seed nasce `disponivel`). */
const setState = (tag: string, pipelineState: ReleasePipelineState) =>
  db.update(releases).set({ pipelineState }).where(eq(releases.tag, tag));

/** Roda a task como o build-runner, com o runtime falso; devolve as imagens baixadas. */
async function check(
  tag: string,
  options: { image?: boolean; pull?: 'ok' | 'absent' | 'error'; attempts?: number } = {},
) {
  const { runtime, pulled } = fakeRuntime({ image: options.image ?? false, pull: options.pull });
  const attempt = {
    logger,
    job: { id: '1', attempts: options.attempts ?? 1, max_attempts: 5 },
  } as unknown as JobHelpers;
  await createCheckReleaseImageTask({
    db,
    runtime,
    settings,
    driver: { kind: 'github', github: {} as GitHubClient },
    now: () => CHECKED_AT.getTime(),
  })({ tag }, attempt);
  return pulled;
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

describe('download e conferência da imagem da release (#570, #661)', () => {
  beforeEach(() => {
    warnings.length = 0;
  });

  it('baixando: baixa a imagem e a release fica disponível, com a data da conferência', async () => {
    await seed('1.2.0');
    await setState('1.2.0', 'baixando');

    expect(await check('1.2.0', { pull: 'ok' })).toEqual([IMAGE]);

    expect(await release('1.2.0')).toMatchObject({
      pipelineState: 'disponivel',
      failureReason: null,
      imageStatus: 'disponivel',
      imageCheckedAt: CHECKED_AT,
    });
  });

  it('baixando: pull que falha na última tentativa leva a falhou com o motivo do runtime', async () => {
    await seed('1.2.0');
    await setState('1.2.0', 'baixando');

    await check('1.2.0', { pull: 'error', attempts: 5 });

    expect(await release('1.2.0')).toMatchObject({
      pipelineState: 'falhou',
      failureReason: 'Não foi possível baixar a imagem: toomanyrequests',
      imageStatus: 'ausente',
      imageCheckedAt: CHECKED_AT,
    });
  });

  it('baixando: pull que falha antes da última tentativa lança e a release continua baixando', async () => {
    await seed('1.2.0');
    await setState('1.2.0', 'baixando');

    await expect(check('1.2.0', { pull: 'error', attempts: 4 })).rejects.toThrow('toomanyrequests');

    expect(await release('1.2.0')).toMatchObject({
      pipelineState: 'baixando',
      failureReason: null,
      imageStatus: null,
    });
  });

  it.each(['disponivel', 'descartada', 'gerando', 'falhou'] as const)(
    'release em %s não muda nem baixa',
    async (state) => {
      await seed('1.2.0');
      await setState('1.2.0', state);
      const before = await release('1.2.0');

      expect(await check('1.2.0', { pull: 'ok', attempts: 5 })).toEqual([]);

      expect(await release('1.2.0')).toEqual(before);
    },
  );

  it('release não registrada: a task não grava nada e avisa', async () => {
    await check('9.9.9', { pull: 'ok' });

    expect(await tags()).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining('9.9.9')]);
  });

  it('reconferir enfileira de novo; pedidos antes de o job rodar viram um só', async () => {
    await seed('1.2.0');

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

describe('migração do estado herdado com imagem ausente', () => {
  const migrate = async () => {
    const migration = await readFile(
      new URL('../../drizzle/0023_estado_herdado_da_release.sql', import.meta.url),
      'utf8',
    );
    await db.execute(sql.raw(migration));
  };

  it('disponivel com imagem ausente vai a falhou; as outras ficam como estão', async () => {
    await db.insert(releases).values([
      { tag: '1.0.1', imageStatus: 'ausente', pipelineState: 'disponivel' },
      { tag: '1.0.2', imageStatus: 'disponivel', pipelineState: 'disponivel' },
      { tag: '1.0.3', imageStatus: null, pipelineState: 'disponivel' },
      { tag: '1.0.4', imageStatus: 'ausente', pipelineState: 'descartada' },
    ]);
    await migrate();
    await migrate();

    expect(await release('1.0.1')).toMatchObject({
      pipelineState: 'falhou',
      failureReason: expect.stringContaining('tente de novo') as unknown,
    });
    expect(await release('1.0.2')).toMatchObject({ pipelineState: 'disponivel' });
    expect(await release('1.0.3')).toMatchObject({ pipelineState: 'disponivel' });
    expect(await release('1.0.4')).toMatchObject({ pipelineState: 'descartada' });
  });

  it('"Tentar de novo" leva a release migrada à conferência da imagem', async () => {
    await db
      .insert(releases)
      .values({ tag: '1.0.1', imageStatus: 'ausente', pipelineState: 'disponivel' });
    await migrate();

    const retried = await retryRelease(db, operacao, '1.0.1');
    expect(retried).toMatchObject({ ok: true, value: { pipelineState: 'baixando' } });
  });
});

describe('disparo e acompanhamento do run (#660)', () => {
  const NOW = Date.parse('2026-11-11T12:00:00Z');
  const runUrl = 'https://github.com/Orakel-AI-Content/platform/actions/runs/12345678901';

  /** Roda a task release-run como o build-runner, com um GitHub falso. */
  async function step(tag: string, github: Partial<GitHubClient>) {
    const fake: GitHubClient = {
      dispatchWorkflow: () => Promise.reject(new Error('dispatch inesperado')),
      getRun: () => Promise.reject(new Error('getRun inesperado')),
      ...github,
    };
    await createReleaseRunTask({ db, driver: { kind: 'github', github: fake }, now: () => NOW })(
      { tag },
      helpers,
    );
  }
  const completed = (conclusion: string): WorkflowRun => ({
    status: 'completed',
    conclusion,
    runUrl,
  });

  async function runJobsAt() {
    const { rows } = await db.execute<{ key: string | null; run_at: Date }>(sql`
      select j.key, j.run_at
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${RELEASE_RUN_TASK}
      order by j.id`);
    return rows.map((r) => ({ key: r.key, runAt: new Date(r.run_at) }));
  }

  it('dispara, grava o run e reagenda a consulta na mesma chave', async () => {
    await requestNew(operacao, 'minor');

    await step('0.1.0', {
      dispatchWorkflow: () => Promise.resolve({ runId: '12345678901', runUrl }),
    });

    expect(await release('0.1.0')).toMatchObject({
      pipelineState: 'gerando',
      runId: '12345678901',
      runUrl,
    });
    expect(await runJobsAt()).toEqual([
      { key: 'release-run:0.1.0', runAt: new Date(NOW + RELEASE_POLL_MS) },
    ]);
  });

  it('run em andamento só reagenda; com sucesso vai a baixando com o download na fila', async () => {
    await requestNew(operacao, 'minor');
    await db.update(releases).set({ runId: '12345678901', runUrl });

    await step('0.1.0', {
      getRun: () => Promise.resolve({ status: 'in_progress', conclusion: null, runUrl }),
    });
    expect(await release('0.1.0')).toMatchObject({ pipelineState: 'gerando' });
    expect(await runJobsAt()).toEqual([
      { key: 'release-run:0.1.0', runAt: new Date(NOW + RELEASE_POLL_MS) },
    ]);
    expect(await checkJobs()).toEqual([]);

    await step('0.1.0', { getRun: () => Promise.resolve(completed('success')) });
    expect(await release('0.1.0')).toMatchObject({
      pipelineState: 'baixando',
      failureReason: null,
      runUrl,
    });
    expect(await checkJobs()).toEqual([
      { payload: { tag: '0.1.0' }, key: 'release-image:0.1.0', max_attempts: 5 },
    ]);
  });

  it('run com falha vai a falhou com o motivo, mantendo o link, sem download', async () => {
    await requestNew(operacao, 'minor');
    await db.update(releases).set({ runId: '12345678901', runUrl });

    await step('0.1.0', { getRun: () => Promise.resolve(completed('failure')) });

    expect(await release('0.1.0')).toMatchObject({
      pipelineState: 'falhou',
      failureReason: 'O CI do release.yml falhou; veja o run',
      runUrl,
    });
    expect(await checkJobs()).toEqual([]);
  });

  it('release descartada no meio do caminho não muda', async () => {
    await requestNew(operacao, 'minor');
    await db.update(releases).set({ runId: '12345678901', runUrl, pipelineState: 'descartada' });

    await step('0.1.0', { getRun: () => Promise.resolve(completed('success')) });

    expect(await release('0.1.0')).toMatchObject({ pipelineState: 'descartada' });
    expect(await checkJobs()).toEqual([]);
  });
});

describe('tentar de novo e descartar (#663)', () => {
  const runUrl = 'https://github.com/Orakel-AI-Content/platform/actions/runs/12345678901';
  const retry = (actor: Actor, tag: string) => db.transaction((tx) => retryRelease(tx, actor, tag));
  const discard = (actor: Actor, tag: string) =>
    db.transaction((tx) => discardRelease(tx, actor, tag));
  const clearJobs = () => db.execute(sql`delete from graphile_worker._private_jobs`);

  /** Release pedida pelo botão cujo CI falhou com o run já disparado. */
  async function ciFailed(tag = '0.1.0') {
    await requestNew(operacao, 'minor');
    await db
      .update(releases)
      .set({ pipelineState: 'falhou', failureReason: 'O CI falhou', runId: '111', runUrl })
      .where(eq(releases.tag, tag));
    await clearJobs();
  }

  /** Release cujo download falhou na última tentativa, como o job grava. */
  async function pullFailed(tag = '1.2.0') {
    await seed(tag);
    await setState(tag, 'baixando');
    await check(tag, { pull: 'error', attempts: 5 });
    await clearJobs();
  }

  /** Roda a task release-run com um GitHub falso que só aceita disparo; devolve os inputs. */
  async function runStep(tag: string) {
    const dispatched: Record<string, string>[] = [];
    const github: GitHubClient = {
      dispatchWorkflow: (_workflow, _ref, inputs) => {
        dispatched.push(inputs);
        return Promise.resolve({ runId: '222', runUrl: `${runUrl}-novo` });
      },
      getRun: () => Promise.reject(new Error('getRun inesperado')),
    };
    await createReleaseRunTask({ db, driver: { kind: 'github', github } })({ tag }, helpers);
    return dispatched;
  }

  async function addSites() {
    for (const id of ['exemplo-a', 'exemplo-b']) {
      const line = (await readFixture(id)).find((l) => l.type === 'config');
      if (line?.type !== 'config') throw new Error(`fixture ${id} sem config`);
      await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
    }
  }

  it('falha no CI: volta a gerando sem run nem motivo, e o run novo é disparado com o mesmo número', async () => {
    await ciFailed();

    const result = await retry(operacao, '0.1.0');

    expect(result).toMatchObject({
      ok: true,
      value: { tag: '0.1.0', pipelineState: 'gerando', failureReason: null, runId: null },
    });
    expect(await runJobs()).toEqual([{ payload: { tag: '0.1.0' }, key: 'release-run:0.1.0' }]);
    expect(await checkJobs()).toEqual([]);

    expect(await runStep('0.1.0')).toEqual([{ version: '0.1.0' }]);
    expect(await release('0.1.0')).toMatchObject({
      pipelineState: 'gerando',
      runId: '222',
      runUrl: `${runUrl}-novo`,
    });
  });

  it('falha no pull: volta a baixando sem motivo, e o download leva a disponível', async () => {
    await pullFailed();

    const result = await retry(SYSTEM_ACTOR, '1.2.0');

    expect(result).toMatchObject({
      ok: true,
      value: { tag: '1.2.0', pipelineState: 'baixando', failureReason: null },
    });
    expect(await checkJobs()).toEqual([
      { payload: { tag: '1.2.0' }, key: 'release-image:1.2.0', max_attempts: 5 },
    ]);
    expect(await runJobs()).toEqual([]);

    expect(await check('1.2.0', { pull: 'ok' })).toEqual([IMAGE]);
    expect(await release('1.2.0')).toMatchObject({ pipelineState: 'disponivel' });
  });

  it.each(['gerando', 'baixando', 'disponivel', 'descartada'] as const)(
    'tentar de novo recusa release em %s com release.not_failed, sem enfileirar',
    async (state) => {
      await seed('1.2.0');
      await setState('1.2.0', state);
      const before = await release('1.2.0');

      expect(await retry(operacao, '1.2.0')).toEqual({
        ok: false,
        issues: [expect.objectContaining({ code: 'release.not_failed', path: ['tag'] })],
      });
      expect(await release('1.2.0')).toEqual(before);
      expect(await runJobs()).toEqual([]);
      expect(await checkJobs()).toEqual([]);
    },
  );

  it('tentar de novo e descartar recusam tag não registrada com release.not_found', async () => {
    for (const result of [await retry(operacao, '9.9.9'), await discard(operacao, '9.9.9')]) {
      expect(result).toEqual({
        ok: false,
        issues: [expect.objectContaining({ code: 'release.not_found', path: ['tag'] })],
      });
    }
  });

  it.each([editor, revisor])(
    'tentar de novo e descartar recusam $roles com forbidden',
    async (actor) => {
      await ciFailed();
      const before = await release('0.1.0');

      for (const result of [await retry(actor, '0.1.0'), await discard(actor, '0.1.0')]) {
        expect(result).toEqual({
          ok: false,
          issues: [expect.objectContaining({ code: 'forbidden' })],
        });
      }
      expect(await release('0.1.0')).toEqual(before);
      expect(await runJobs()).toEqual([]);
    },
  );

  it.each(['disponivel', 'falhou', 'gerando', 'baixando'] as const)(
    'descartar marca descartada a release em %s que nenhum site usa',
    async (state) => {
      await addSites();
      await seed('1.2.0');
      await setState('1.2.0', state);
      await db.update(sites).set({ release: '1.1.0' }).where(eq(sites.id, 'exemplo-a'));

      expect(await discard(operacao, '1.2.0')).toMatchObject({
        ok: true,
        value: { tag: '1.2.0', pipelineState: 'descartada' },
      });
      expect(await release('1.2.0')).toMatchObject({ pipelineState: 'descartada' });
    },
  );

  it('descartar recusa com release.in_use, nomeando os sites, quando algum site usa a tag', async () => {
    await addSites();
    await seed('1.2.0');
    await db.update(sites).set({ release: '1.2.0' });

    const result = await discard(operacao, '1.2.0');

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'release.in_use', path: ['tag'] })],
    });
    expect(result.ok ? '' : result.issues[0]?.message).toContain('exemplo-a, exemplo-b');
    expect(await release('1.2.0')).toMatchObject({ pipelineState: 'disponivel' });
  });

  it('descartar recusa release já descartada com release.already_discarded', async () => {
    await seed('1.2.0');
    await setState('1.2.0', 'descartada');

    expect(await discard(operacao, '1.2.0')).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'release.already_discarded', path: ['tag'] })],
    });
  });

  it('descartada em gerando ou baixando não muda quando o job da etapa roda depois', async () => {
    await requestNew(operacao, 'minor');
    expect(await discard(operacao, '0.1.0')).toMatchObject({ ok: true });
    expect(await runStep('0.1.0')).toEqual([]);
    expect(await release('0.1.0')).toMatchObject({ pipelineState: 'descartada', runId: null });

    await seed('1.2.0');
    await setState('1.2.0', 'baixando');
    expect(await discard(operacao, '1.2.0')).toMatchObject({ ok: true });
    expect(await check('1.2.0', { pull: 'ok' })).toEqual([]);
    expect(await release('1.2.0')).toMatchObject({
      pipelineState: 'descartada',
      imageStatus: null,
    });
  });

  it('o número descartado continua contando para o próximo', async () => {
    await requestNew(operacao, 'minor');
    await discard(operacao, '0.1.0');

    expect(await requestNew(operacao, 'minor')).toMatchObject({
      ok: true,
      value: { tag: '0.2.0' },
    });
  });
});
