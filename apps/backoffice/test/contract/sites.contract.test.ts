import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { siteConfigs, sitePolicyTriggers, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { configureBuildWindow } from '../../src/domain/builds/schedule.ts';
import { setBuildWindow } from '../../src/domain/builds/site-state.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { registerPolicyTrigger } from '../../src/domain/sites/policy-triggers.ts';
import {
  createSite,
  exportSitesTfvars,
  listSites,
  unresolvedPendingChangeIds,
  updateSiteConfig,
} from '../../src/domain/sites/sites.ts';
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
