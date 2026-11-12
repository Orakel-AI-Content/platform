import { RESOURCES } from '@orakel/content-model/v1';
import { count, eq, sql } from 'drizzle-orm';
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import {
  builds,
  pendingChanges,
  releases,
  siteConfigs,
  siteEvents,
  sitePolicyTriggers,
  sites,
} from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { configureBuildWindow } from '../../src/domain/builds/schedule.ts';
import { createAuthor } from '../../src/domain/content/authors.ts';
import {
  CHECK_SITE_INFRA_TASK,
  pauseSite,
  pauseSiteManually,
  resumeSite,
  scheduleSiteInfraCheck,
  setBuildWindow,
  setDailyPublishLimit,
} from '../../src/domain/builds/site-state.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { configureDailyPublishLimit } from '../../src/domain/publications/publish.ts';
import {
  listPolicyTriggers,
  registerPolicyTrigger,
} from '../../src/domain/sites/policy-triggers.ts';
import {
  createSite,
  exportSitesTfvars,
  listSites,
  readSiteInstance,
  resourcesFor,
  unresolvedPendingChangeIds,
  updateSiteConfig,
} from '../../src/domain/sites/sites.ts';
import { createCheckSiteInfraTask } from '../../src/jobs/tasks/check-site-infra.ts';
import type { ZoneStatus } from '../../src/lib/cloudflare.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  for (const siteId of ['exemplo-a', 'exemplo-b']) {
    const line = (await readFixture(siteId)).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    await db.transaction((tx) => createSite(tx, SYSTEM_ACTOR, line.data));
  }
});

describe('registro de instâncias', () => {
  it('mostra a janela própria e a efetiva de cada site', async () => {
    configureBuildWindow(45_000);
    try {
      await db.transaction((tx) => setBuildWindow(tx, SYSTEM_ACTOR, 'exemplo-a', 30));
      const result = await listSites(db, SYSTEM_ACTOR);

      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      expect(
        result.value.map(({ id, buildWindowSeconds, effectiveBuildWindowSeconds }) => ({
          id,
          buildWindowSeconds,
          effectiveBuildWindowSeconds,
        })),
      ).toEqual([
        { id: 'exemplo-a', buildWindowSeconds: 30, effectiveBuildWindowSeconds: 30 },
        { id: 'exemplo-b', buildWindowSeconds: null, effectiveBuildWindowSeconds: 45 },
      ]);
    } finally {
      configureBuildWindow(15 * 60_000);
    }
  });
});

describe('versão ativa e culpado da pausa (#510)', () => {
  it('listSites expõe a versão no ar e o culpado da pausa', async () => {
    await db
      .update(sites)
      .set({
        activeVersionId: 'v-1',
        state: 'pausado',
        pausedReason: 'render: snapshot inválido',
        pausedCulpritOrigin: 'content',
        pausedCulpritReference: '42',
      })
      .where(eq(sites.id, 'exemplo-a'));

    const result = await listSites(db, SYSTEM_ACTOR);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(
      result.value.map(({ id, activeVersionId, pausedCulprit }) => ({
        id,
        activeVersionId,
        pausedCulprit,
      })),
    ).toEqual([
      {
        id: 'exemplo-a',
        activeVersionId: 'v-1',
        pausedCulprit: { origin: 'content', reference: '42' },
      },
      { id: 'exemplo-b', activeVersionId: null, pausedCulprit: null },
    ]);
  });
});

describe('estado da instância (#516)', () => {
  const base = new Date('2026-10-20T12:00:00.000Z').getTime();
  /** Build do site terminado `minute` minutos depois da base. */
  const build = (
    siteId: string,
    minute: number,
    status: 'ok' | 'failed',
    versionId: string | null = null,
    files: number | null = null,
  ) => ({
    siteId,
    release: `1.${minute}.0`,
    attempt: 1,
    status,
    versionId,
    files,
    startedAt: new Date(base + minute * 60_000 - 30_000),
    finishedAt: new Date(base + minute * 60_000),
  });

  it('traz os 5 builds mais recentes do site, do mais novo para o mais antigo', async () => {
    // Inseridos fora de ordem: a ordem vem de finishedAt, não do id.
    await db
      .insert(builds)
      .values([
        build('exemplo-a', 4, 'ok', 'v-4', 40),
        build('exemplo-a', 1, 'ok', 'v-1', 10),
        build('exemplo-a', 7, 'failed'),
        build('exemplo-a', 2, 'failed'),
        build('exemplo-a', 6, 'ok', 'v-6', 60),
        build('exemplo-a', 3, 'ok', 'v-3', 30),
        build('exemplo-a', 5, 'failed'),
        build('exemplo-b', 9, 'ok', 'v-b', 99),
      ]);

    const result = await readSiteInstance(db, SYSTEM_ACTOR, 'exemplo-a');

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(
      result.value.recentBuilds.map(({ status, release, versionId, finishedAt }) => ({
        status,
        release,
        versionId,
        finishedAt: finishedAt.toISOString(),
      })),
    ).toEqual([
      {
        status: 'failed',
        release: '1.7.0',
        versionId: null,
        finishedAt: '2026-10-20T12:07:00.000Z',
      },
      {
        status: 'ok',
        release: '1.6.0',
        versionId: 'v-6',
        finishedAt: '2026-10-20T12:06:00.000Z',
      },
      {
        status: 'failed',
        release: '1.5.0',
        versionId: null,
        finishedAt: '2026-10-20T12:05:00.000Z',
      },
      {
        status: 'ok',
        release: '1.4.0',
        versionId: 'v-4',
        finishedAt: '2026-10-20T12:04:00.000Z',
      },
      {
        status: 'ok',
        release: '1.3.0',
        versionId: 'v-3',
        finishedAt: '2026-10-20T12:03:00.000Z',
      },
    ]);
  });

  it('os arquivos vêm do build ok da versão ativa, não do último build', async () => {
    // Rollback para v-3: o último build ok (v-6) e o falho depois dele não estão no ar.
    await db
      .insert(builds)
      .values([
        build('exemplo-a', 3, 'ok', 'v-3', 30),
        build('exemplo-a', 6, 'ok', 'v-6', 60),
        build('exemplo-a', 7, 'failed', null, 70),
      ]);
    await db.update(sites).set({ activeVersionId: 'v-3' }).where(eq(sites.id, 'exemplo-a'));

    const result = await readSiteInstance(db, SYSTEM_ACTOR, 'exemplo-a');

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.activeFiles).toBe(30);
  });

  it('a versão ativa entrou no ar pela execução ok mais recente dela, build ou rollback', async () => {
    // v-3 foi publicada pela janela (sem autor) e depois reativada por um rollback da ana.
    await db.insert(builds).values([
      { ...build('exemplo-a', 3, 'ok', 'v-3', 30), pages: 12 },
      { ...build('exemplo-a', 6, 'ok', 'v-6', 60), requestedBy: 'bia@orakel.local' },
      {
        ...build('exemplo-a', 8, 'ok', 'v-3'),
        kind: 'rollback' as const,
        requestedBy: 'ana@orakel.local',
      },
    ]);
    await db.update(sites).set({ activeVersionId: 'v-3' }).where(eq(sites.id, 'exemplo-a'));

    const result = await readSiteInstance(db, SYSTEM_ACTOR, 'exemplo-a');

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.activePages).toBe(12);
    expect(result.value.activeSince).toEqual({
      at: new Date('2026-10-20T12:08:00.000Z'),
      by: 'ana@orakel.local',
    });
  });

  it('conta as pendências por origem, sem as resolvidas e sem as de outro site', async () => {
    const author = (slug: string) => ({ slug, name: slug });
    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-a', author('ana')));
    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-a', author('bia')));
    await db.transaction((tx) => createAuthor(tx, SYSTEM_ACTOR, 'exemplo-b', author('caio')));
    // O build baixou a criação dos sites (config v1).
    await db
      .update(pendingChanges)
      .set({ resolvedAt: new Date() })
      .where(eq(pendingChanges.reference, 'v1'));

    const result = await readSiteInstance(db, SYSTEM_ACTOR, 'exemplo-a');

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.pendingByOrigin).toEqual([{ origin: 'author', count: 2 }]);
  });

  it('sem builds e sem pendências, devolve listas vazias e nenhum arquivo', async () => {
    await db.update(pendingChanges).set({ resolvedAt: new Date() });

    expect(await readSiteInstance(db, SYSTEM_ACTOR, 'exemplo-a')).toEqual({
      ok: true,
      value: {
        recentBuilds: [],
        activeFiles: null,
        activePages: null,
        activeSince: null,
        pendingByOrigin: [],
      },
    });
  });

  it('sem site.read, recusa', async () => {
    const result = await readSiteInstance(db, { email: 'x@orakel.local', roles: [] }, 'exemplo-a');
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });

  it('site inexistente, recusa', async () => {
    const result = await readSiteInstance(db, SYSTEM_ACTOR, 'nao-existe');
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });

  it('listSites não muda de forma', async () => {
    const result = await listSites(db, SYSTEM_ACTOR);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(Object.keys(result.value[0] ?? {}).sort()).toEqual(
      [
        'activeVersionId',
        'buildWindowSeconds',
        'dailyPublishLimit',
        'domain',
        'effectiveBuildWindowSeconds',
        'effectiveDailyPublishLimit',
        'id',
        'indexavel',
        'lastBuild',
        'lifecycle',
        'name',
        'pausedCulprit',
        'pausedReason',
        'pendingChanges',
        'publishedToday',
        'release',
        'state',
        'timeZone',
      ].sort(),
    );
  });
});

describe('limite diário do site (#490)', () => {
  const limitOf = async (siteId: string) => {
    const [row] = await db
      .select({ dailyPublishLimit: sites.dailyPublishLimit })
      .from(sites)
      .where(eq(sites.id, siteId));
    return row?.dailyPublishLimit;
  };

  it('grava o próprio, volta ao padrão com null e lista o próprio e o efetivo', async () => {
    configureDailyPublishLimit(3);
    expect(
      await db.transaction((tx) => setDailyPublishLimit(tx, SYSTEM_ACTOR, 'exemplo-a', 5)),
    ).toEqual({ ok: true, value: undefined });

    const listed = await listSites(db, SYSTEM_ACTOR);
    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    expect(
      listed.value.map(({ id, dailyPublishLimit, effectiveDailyPublishLimit }) => ({
        id,
        dailyPublishLimit,
        effectiveDailyPublishLimit,
      })),
    ).toEqual([
      { id: 'exemplo-a', dailyPublishLimit: 5, effectiveDailyPublishLimit: 5 },
      { id: 'exemplo-b', dailyPublishLimit: null, effectiveDailyPublishLimit: 3 },
    ]);

    await db.transaction((tx) => setDailyPublishLimit(tx, SYSTEM_ACTOR, 'exemplo-a', null));
    const reset = await listSites(db, SYSTEM_ACTOR);
    if (!reset.ok) throw new Error(JSON.stringify(reset.issues));
    expect(reset.value[0]).toMatchObject({
      dailyPublishLimit: null,
      effectiveDailyPublishLimit: 3,
    });
  });

  it('não cria mudança pendente', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');
    await db.transaction((tx) => setDailyPublishLimit(tx, SYSTEM_ACTOR, 'exemplo-a', 5));

    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);
  });

  it.each([0, -1, 1.5])('recusa %s com issue no campo, sem gravar', async (limit) => {
    expect(
      await db.transaction((tx) => setDailyPublishLimit(tx, SYSTEM_ACTOR, 'exemplo-a', limit)),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'site.daily_publish_limit_invalid', path: ['dailyPublishLimit'] }],
    });
    expect(await limitOf('exemplo-a')).toBeNull();
  });

  it('recusa site inexistente', async () => {
    expect(
      await db.transaction((tx) => setDailyPublishLimit(tx, SYSTEM_ACTOR, 'outro', 5)),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });

  it.each(['editor', 'revisor'] as const)('%s não define o limite', async (role) => {
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(
      await db.transaction((tx) => setDailyPublishLimit(tx, actor, 'exemplo-a', 5)),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await limitOf('exemplo-a')).toBeNull();
  });
});

describe('fuso do site (#90)', () => {
  it('lista cada site com o timeZone da configuração corrente', async () => {
    const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    const updated = await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-a', { ...line.data, timeZone: 'Europe/Lisbon' }),
    );
    if (!updated.ok) throw new Error(JSON.stringify(updated.issues));

    const result = await listSites(db, SYSTEM_ACTOR);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const fixtureB = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
    if (fixtureB?.type !== 'config') throw new Error('fixture sem config');
    expect(result.value.map(({ id, timeZone }) => ({ id, timeZone }))).toEqual([
      { id: 'exemplo-a', timeZone: 'Europe/Lisbon' },
      { id: 'exemplo-b', timeZone: fixtureB.data.timeZone },
    ]);
  });
});

describe('recursos da release do site (#71)', () => {
  it('sem registro por release, devolve os RESOURCES com release nula ou registrada', async () => {
    await db.update(sites).set({ release: '1.2.0' }).where(eq(sites.id, 'exemplo-b'));

    expect(await resourcesFor(db, 'exemplo-a')).toEqual(RESOURCES);
    expect(await resourcesFor(db, 'exemplo-b')).toEqual(RESOURCES);
  });
});

describe('configuração de outro site (#97)', () => {
  it('recusa trocar o ID com a mensagem na linguagem de quem usa, sem SITE_ID', async () => {
    const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');

    const result = await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-a', line.data),
    );

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'site.id_mismatch' }] });
    if (result.ok) return;
    expect(result.issues[0]?.message).toBe(
      'O ID do site não muda: a configuração é de exemplo-b, o site é exemplo-a',
    );
  });
});

describe('tema do site (#163)', () => {
  const fixtureConfig = async (siteId: string) => {
    const line = (await readFixture(siteId)).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    return line.data;
  };

  it('recusa cadastrar com tema inexistente, no campo theme, sem gravar nada', async () => {
    const result = await db.transaction(async (tx) =>
      createSite(tx, SYSTEM_ACTOR, {
        ...(await fixtureConfig('exemplo-a')),
        siteId: 'exemplo-c',
        theme: 'padrao',
      }),
    );

    expect(result).toEqual({
      ok: false,
      issues: [
        { code: 'site.theme_unknown', message: 'Tema "padrao" não existe', path: ['theme'] },
      ],
    });
    expect(await db.select().from(sites).where(eq(sites.id, 'exemplo-c'))).toEqual([]);
  });

  it('recusa editar para tema inexistente e aceita outro tema de THEME_IDS', async () => {
    const config = await fixtureConfig('exemplo-a');

    const refused = await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-a', { ...config, theme: 'nao-existe' }),
    );
    expect(refused).toMatchObject({
      ok: false,
      issues: [{ code: 'site.theme_unknown', path: ['theme'] }],
    });

    const accepted = await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-a', { ...config, theme: 'exemplo-b' }),
    );
    expect(accepted.ok).toBe(true);
  });
});

describe('sites.auto.tfvars.json', () => {
  it('lista todos os sites por SITE_ID, com os domínios (o principal primeiro)', async () => {
    const result = await exportSitesTfvars(db, SYSTEM_ACTOR);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const parsed = JSON.parse(result.value) as { sites: Record<string, { domains: string[] }> };
    expect(Object.keys(parsed.sites)).toEqual(['exemplo-a', 'exemplo-b']);
    for (const siteId of ['exemplo-a', 'exemplo-b']) {
      const config = (await readFixture(siteId)).find((l) => l.type === 'config');
      if (config?.type !== 'config') throw new Error('fixture sem config');
      expect(parsed.sites[siteId]).toEqual({ domains: config.data.domains });
    }
  });

  it('segue a configuração corrente e sai igual, byte a byte, sem mudança no registro', async () => {
    const line = (await readFixture('exemplo-b')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    await db.transaction((tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', {
        ...line.data,
        domains: ['novo.example.com', ...line.data.domains],
      }),
    );

    const first = await exportSitesTfvars(db, SYSTEM_ACTOR);
    const second = await exportSitesTfvars(db, SYSTEM_ACTOR);
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    expect(second).toEqual(first);
    expect(first.value.endsWith('}\n')).toBe(true);
    const parsed = JSON.parse(first.value) as { sites: Record<string, { domains: string[] }> };
    expect(parsed.sites['exemplo-b']?.domains[0]).toBe('novo.example.com');
  });

  it.each(['editor', 'revisor'] as const)('%s não baixa o arquivo', async (role) => {
    expect(
      await exportSitesTfvars(db, { email: `${role}@orakel.local`, roles: [role] }),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });
});

describe('gatilhos de política e indexação', () => {
  async function config(siteId: string) {
    const line = (await readFixture(siteId)).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    return line.data;
  }
  const versions = async (siteId: string) =>
    (await db.select({ total: count() }).from(siteConfigs).where(eq(siteConfigs.siteId, siteId)))[0]
      ?.total;
  const indexable = async (siteId: string) =>
    db.transaction(async (tx) =>
      updateSiteConfig(tx, SYSTEM_ACTOR, siteId, { ...(await config(siteId)), indexavel: true }),
    );

  it('recusa cadastrar um site já indexável, sem gravar nada', async () => {
    const result = await db.transaction(async (tx) =>
      createSite(tx, SYSTEM_ACTOR, {
        ...(await config('exemplo-a')),
        siteId: 'exemplo-c',
        indexavel: true,
      }),
    );

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'site.g1_required' }] });
    expect(await db.select({ id: sites.id }).from(sites).where(eq(sites.id, 'exemplo-c'))).toEqual(
      [],
    );
    expect(await unresolvedPendingChangeIds(db, 'exemplo-c')).toEqual([]);
  });

  it('recusa ligar a indexação sem G1 e aceita depois de registrá-lo', async () => {
    const before = await unresolvedPendingChangeIds(db, 'exemplo-a');
    expect(await indexable('exemplo-a')).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'site.g1_required',
          message: 'O site exemplo-a só pode ficar indexável depois do G1 registrado',
        },
      ],
    });
    expect(await versions('exemplo-a')).toBe(1);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);

    expect(
      await db.transaction((tx) =>
        registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G1', 'Políticas publicadas'),
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(before);

    expect(await indexable('exemplo-a')).toEqual({ ok: true, value: { version: 2 } });
  });

  it('o G1 de um site não libera a indexação de outro', async () => {
    await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G1'));

    expect(await indexable('exemplo-b')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.g1_required' }],
    });
  });

  it('guarda o gatilho, quem registrou, quando e a observação', async () => {
    const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] as const };
    const before = Date.now();
    await db.transaction((tx) =>
      registerPolicyTrigger(tx, operacao, 'exemplo-a', 'G1', 'Políticas publicadas'),
    );

    const [row] = await db.select().from(sitePolicyTriggers);
    expect(row).toMatchObject({
      siteId: 'exemplo-a',
      trigger: 'G1',
      registeredBy: 'operacao@orakel.local',
      note: 'Políticas publicadas',
    });
    expect(row?.registeredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('recusa gatilho repetido e site inexistente', async () => {
    await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G1'));

    expect(
      await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G1')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.trigger_exists' }] });
    expect(
      await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'outro', 'G1')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });

  it.each(['editor', 'revisor'] as const)('%s não registra gatilho', async (role) => {
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(
      await db.transaction((tx) => registerPolicyTrigger(tx, actor, 'exemplo-a', 'G1')),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await db.select().from(sitePolicyTriggers)).toEqual([]);
  });

  it('desligar a indexação de um site indexável sem G1 é aceito', async () => {
    // Site que ficou indexável antes da regra (gravado direto, sem o domínio).
    const current = await config('exemplo-b');
    await db
      .insert(siteConfigs)
      .values({ siteId: 'exemplo-b', version: 2, config: { ...current, indexavel: true } });

    expect(
      await db.transaction((tx) =>
        updateSiteConfig(tx, SYSTEM_ACTOR, 'exemplo-b', { ...current, indexavel: false }),
      ),
    ).toEqual({ ok: true, value: { version: 3 } });
  });

  it('o seed das fixtures continua passando', async () => {
    await resetDatabase(db);
    for (const siteId of ['exemplo-a', 'exemplo-b']) {
      expect(await importSnapshot(db, SYSTEM_ACTOR, await readFixture(siteId))).toEqual({
        ok: true,
        value: { siteId },
      });
    }
  });
});

describe('leitura dos gatilhos de política', () => {
  const operacao = { email: 'operacao@orakel.local', roles: ['operacao'] as const };

  it('devolve o gatilho, quem registrou, quando e a observação', async () => {
    const before = Date.now();
    await db.transaction((tx) =>
      registerPolicyTrigger(tx, operacao, 'exemplo-a', 'G1', 'Políticas publicadas'),
    );

    const result = await listPolicyTriggers(db, SYSTEM_ACTOR, 'exemplo-a');
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      trigger: 'G1',
      registeredBy: 'operacao@orakel.local',
      note: 'Políticas publicadas',
    });
    expect(result.value[0]?.registeredAt).toBeInstanceOf(Date);
    expect(result.value[0]?.registeredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('lista vazia sem gatilhos, recusa site inexistente e não mistura sites', async () => {
    await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G1'));

    expect(await listPolicyTriggers(db, SYSTEM_ACTOR, 'exemplo-b')).toEqual({
      ok: true,
      value: [],
    });
    expect(await listPolicyTriggers(db, SYSTEM_ACTOR, 'outro')).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
  });

  it('ordena por gatilho: G1 antes de G2', async () => {
    await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G2'));
    await db.transaction((tx) => registerPolicyTrigger(tx, SYSTEM_ACTOR, 'exemplo-a', 'G1'));

    const result = await listPolicyTriggers(db, SYSTEM_ACTOR, 'exemplo-a');
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.map((record) => record.trigger)).toEqual(['G1', 'G2']);
  });

  it.each(['editor', 'revisor'] as const)('%s lê os gatilhos', async (role) => {
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(await listPolicyTriggers(db, actor, 'exemplo-a')).toEqual({ ok: true, value: [] });
  });

  it('sem papel, forbidden', async () => {
    expect(
      await listPolicyTriggers(db, { email: 'x@orakel.local', roles: [] }, 'exemplo-a'),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
  });

  it('não grava nada nem cria mudança pendente', async () => {
    const pending = await unresolvedPendingChangeIds(db, 'exemplo-a');
    await listPolicyTriggers(db, SYSTEM_ACTOR, 'exemplo-a');

    expect(await db.select().from(sitePolicyTriggers)).toEqual([]);
    expect(await unresolvedPendingChangeIds(db, 'exemplo-a')).toEqual(pending);
  });
});

describe('pausa manual com motivo (#644)', () => {
  const operacao = { email: 'o@orakel.local', roles: ['operacao'] as const };

  async function stateOf(siteId: string) {
    const [row] = await db
      .select({
        state: sites.state,
        pausedReason: sites.pausedReason,
        pausedCulpritOrigin: sites.pausedCulpritOrigin,
        pausedCulpritReference: sites.pausedCulpritReference,
      })
      .from(sites)
      .where(eq(sites.id, siteId));
    return row;
  }

  async function events() {
    return db
      .select({
        siteId: siteEvents.siteId,
        kind: siteEvents.kind,
        requestedBy: siteEvents.requestedBy,
        reason: siteEvents.reason,
        culpritOrigin: siteEvents.culpritOrigin,
        culpritReference: siteEvents.culpritReference,
      })
      .from(siteEvents)
      .orderBy(siteEvents.id);
  }

  async function buildJobKeys(): Promise<string[]> {
    const result = await db.execute<{ key: string }>(
      sql`select key from graphile_worker.jobs where task_identifier = 'build'`,
    );
    return result.rows.map((row) => row.key);
  }

  it('pausa o site ativo com o motivo, sem culpado, e grava o evento com quem pediu', async () => {
    expect(
      await db.transaction((tx) =>
        pauseSiteManually(tx, operacao, 'exemplo-a', '  Migração do DNS  '),
      ),
    ).toEqual({ ok: true, value: undefined });

    expect(await stateOf('exemplo-a')).toEqual({
      state: 'pausado',
      pausedReason: 'Migração do DNS',
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    });
    expect(await stateOf('exemplo-b')).toMatchObject({ state: 'ativo' });
    expect(await events()).toEqual([
      {
        siteId: 'exemplo-a',
        kind: 'pausa',
        requestedBy: 'o@orakel.local',
        reason: 'Migração do DNS',
        culpritOrigin: null,
        culpritReference: null,
      },
    ]);
  });

  it.each(['', '   '])('recusa motivo vazio (%j), sem pausar', async (reason) => {
    expect(
      await db.transaction((tx) => pauseSiteManually(tx, operacao, 'exemplo-a', reason)),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'site.pause_reason_required', path: ['reason'] }],
    });
    expect(await stateOf('exemplo-a')).toMatchObject({ state: 'ativo', pausedReason: null });
    expect(await events()).toEqual([]);
  });

  it('recusa site já pausado com erro próprio e mantém o motivo e o culpado anteriores', async () => {
    await db.transaction((tx) =>
      pauseSite(tx, 'exemplo-a', 'render: Snapshot inválido', {
        origin: 'content',
        reference: '42',
      }),
    );
    expect(
      await db.transaction((tx) => pauseSiteManually(tx, operacao, 'exemplo-a', 'Outro motivo')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.already_paused' }] });

    expect(await stateOf('exemplo-a')).toEqual({
      state: 'pausado',
      pausedReason: 'render: Snapshot inválido',
      pausedCulpritOrigin: 'content',
      pausedCulpritReference: '42',
    });
    expect(await events()).toMatchObject([{ kind: 'pausa', requestedBy: 'system' }]);
  });

  it('recusa site inexistente', async () => {
    expect(
      await db.transaction((tx) => pauseSiteManually(tx, operacao, 'nao-existe', 'Motivo')),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });

  it.each(['editor', 'revisor'] as const)(
    '%s recebe forbidden e o site continua ativo',
    async (role) => {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(
        await db.transaction((tx) => pauseSiteManually(tx, actor, 'exemplo-a', 'Motivo')),
      ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
      expect(await stateOf('exemplo-a')).toMatchObject({ state: 'ativo' });
      expect(await events()).toEqual([]);
    },
  );

  it('"Retomar" desfaz a pausa manual: volta a ativo e enfileira o build', async () => {
    await db.transaction((tx) => pauseSiteManually(tx, operacao, 'exemplo-a', 'Manutenção'));
    await db.execute(sql`delete from graphile_worker._private_jobs`);

    expect(await db.transaction((tx) => resumeSite(tx, operacao, 'exemplo-a'))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await stateOf('exemplo-a')).toEqual({
      state: 'ativo',
      pausedReason: null,
      pausedCulpritOrigin: null,
      pausedCulpritReference: null,
    });
    expect(await buildJobKeys()).toEqual(['build:exemplo-a']);
    expect((await events()).map(({ kind, requestedBy }) => ({ kind, requestedBy }))).toEqual([
      { kind: 'pausa', requestedBy: 'o@orakel.local' },
      { kind: 'retomada', requestedBy: 'o@orakel.local' },
    ]);
  });

  it('não cria mudança pendente', async () => {
    const [before] = await db.select({ n: count() }).from(pendingChanges);
    await db.transaction((tx) => pauseSiteManually(tx, operacao, 'exemplo-a', 'Manutenção'));
    const [after] = await db.select({ n: count() }).from(pendingChanges);
    expect(after?.n).toBe(before?.n);
  });
});

describe('versão no cadastro do site (#689)', () => {
  const createExemploC = async () => {
    const line = (await readFixture('exemplo-a')).find((l) => l.type === 'config');
    if (line?.type !== 'config') throw new Error('fixture sem config');
    return db.transaction((tx) =>
      createSite(tx, SYSTEM_ACTOR, { ...line.data, siteId: 'exemplo-c' }),
    );
  };
  const releaseOf = async (siteId: string) =>
    (await db.select({ release: sites.release }).from(sites).where(eq(sites.id, siteId)))[0]
      ?.release;

  it('grava a release disponível mais recente, em ordem numérica, sem evento', async () => {
    await db.insert(releases).values([
      { tag: '1.4.0', pipelineState: 'disponivel' },
      { tag: '1.10.0', pipelineState: 'disponivel' },
      { tag: '1.11.0', pipelineState: 'gerando' },
    ]);

    expect(await createExemploC()).toEqual({ ok: true, value: { siteId: 'exemplo-c' } });

    expect(await releaseOf('exemplo-c')).toBe('1.10.0');
    expect(await db.select().from(siteEvents).where(eq(siteEvents.siteId, 'exemplo-c'))).toEqual(
      [],
    );
  });

  it('sem release disponível, grava nula', async () => {
    await db.insert(releases).values({ tag: '1.11.0', pipelineState: 'gerando' });

    expect(await createExemploC()).toMatchObject({ ok: true });

    expect(await releaseOf('exemplo-c')).toBeNull();
  });
});

describe('conferência automática da infra (#718)', () => {
  const T1 = Date.parse('2026-11-12T12:00:00Z');
  const T2 = Date.parse('2026-11-12T12:05:00Z');

  /** Roda a task de verdade, com o banco da suíte e a consulta da zona falsa. */
  async function check(
    byDomain: Record<string, ZoneStatus>,
    at: number,
    payload: unknown = null,
  ): Promise<string[]> {
    const checked: string[] = [];
    const task = createCheckSiteInfraTask({
      db,
      zones: {
        check(domain) {
          checked.push(domain);
          return Promise.resolve(byDomain[domain] ?? { kind: 'inexistente' });
        },
      },
      now: () => new Date(at),
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await task(payload, { logger } as unknown as JobHelpers);
    return checked;
  }

  async function site(siteId: string) {
    const [row] = await db
      .select({
        lifecycle: sites.lifecycle,
        infraCheckedAt: sites.infraCheckedAt,
        infraCheckError: sites.infraCheckError,
      })
      .from(sites)
      .where(eq(sites.id, siteId));
    return row;
  }

  it('pendente leva cadastrado a infra_aplicada; ativa leva a zona_ativa, inclusive de cadastrado', async () => {
    await check(
      {
        'exemplo-a.com.br': { kind: 'pendente', status: 'pending' },
        'exemplo-b.com.br': { kind: 'ativa' },
      },
      T1,
    );

    expect(await site('exemplo-a')).toEqual({
      lifecycle: 'infra_aplicada',
      infraCheckedAt: new Date(T1),
      infraCheckError: null,
    });
    expect(await site('exemplo-b')).toEqual({
      lifecycle: 'zona_ativa',
      infraCheckedAt: new Date(T1),
      infraCheckError: null,
    });

    await check({ 'exemplo-a.com.br': { kind: 'ativa' } }, T2);
    expect((await site('exemplo-a'))?.lifecycle).toBe('zona_ativa');
  });

  it('inexistente grava a conferência e não muda a etapa', async () => {
    await check({}, T1);

    expect(await site('exemplo-a')).toEqual({
      lifecycle: 'cadastrado',
      infraCheckedAt: new Date(T1),
      infraCheckError: null,
    });
  });

  it('falha guarda a mensagem e o horário sem mudar a etapa; a próxima conferência bem-sucedida limpa', async () => {
    const falha: ZoneStatus = {
      kind: 'falha',
      message: 'Cloudflare respondeu 503 (zona exemplo-a.com.br)',
      transient: true,
    };
    await check({ 'exemplo-a.com.br': falha }, T1);
    expect(await site('exemplo-a')).toEqual({
      lifecycle: 'cadastrado',
      infraCheckedAt: new Date(T1),
      infraCheckError: falha.message,
    });

    await check({ 'exemplo-a.com.br': { kind: 'pendente', status: 'pending' } }, T2);
    expect(await site('exemplo-a')).toEqual({
      lifecycle: 'infra_aplicada',
      infraCheckedAt: new Date(T2),
      infraCheckError: null,
    });
  });

  it('não consulta sites em zona_ativa nem publicado', async () => {
    await db.update(sites).set({ lifecycle: 'zona_ativa' }).where(eq(sites.id, 'exemplo-a'));
    await db.update(sites).set({ lifecycle: 'publicado' }).where(eq(sites.id, 'exemplo-b'));

    expect(await check({}, T1)).toEqual([]);
    expect((await site('exemplo-a'))?.infraCheckedAt).toBeNull();
    expect((await site('exemplo-b'))?.infraCheckedAt).toBeNull();
  });

  it('com { siteId } confere só aquele site', async () => {
    expect(await check({}, T1, { siteId: 'exemplo-b' })).toEqual(['exemplo-b.com.br']);
    expect((await site('exemplo-a'))?.infraCheckedAt).toBeNull();
  });

  it('a conferência não gera mudança pendente', async () => {
    const before = await db.select({ n: count() }).from(pendingChanges);
    await check({ 'exemplo-a.com.br': { kind: 'ativa' } }, T1);
    await check({ 'exemplo-b.com.br': { kind: 'falha', message: 'x', transient: false } }, T1);

    expect(await db.select({ n: count() }).from(pendingChanges)).toEqual(before);
  });

  it('enfileirar a conferência de um site de novo não duplica o job (jobKey por site)', async () => {
    await db.transaction((tx) => scheduleSiteInfraCheck(tx, 'exemplo-a'));
    await db.transaction((tx) => scheduleSiteInfraCheck(tx, 'exemplo-a'));
    await db.transaction((tx) => scheduleSiteInfraCheck(tx, 'exemplo-b'));

    const jobs = await db.execute<{ key: string; payload: unknown; max_attempts: number }>(
      sql`select j.key, j.payload, j.max_attempts from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = ${CHECK_SITE_INFRA_TASK} order by j.key`,
    );
    expect(jobs.rows).toEqual([
      { key: 'site-infra:exemplo-a', payload: { siteId: 'exemplo-a' }, max_attempts: 1 },
      { key: 'site-infra:exemplo-b', payload: { siteId: 'exemplo-b' }, max_attempts: 1 },
    ]);
  });
});
