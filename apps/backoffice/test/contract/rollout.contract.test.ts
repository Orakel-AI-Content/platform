import { asc, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import {
  audienceDailySite,
  builds,
  pendingChanges,
  releaseRollouts,
  releaseRolloutSites,
  releases,
  siteEvents,
  sites,
} from '../../src/db/schema/index.ts';
import type { Actor } from '../../src/domain/access/rbac.ts';
import { latestRollout, startRollout } from '../../src/domain/releases/rollout.ts';
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
const now = new Date('2026-11-12T15:00:00Z');

const site = (id: string, values: Partial<typeof sites.$inferInsert> = {}) =>
  db.insert(sites).values({ id, name: id, release: '1.0.0', ...values });

const views = (siteId: string, day: string, count: number) =>
  db.insert(audienceDailySite).values({ siteId, day, views: count, sessions: 0 });

/**
 * Cinco sites: site-a já na 1.1.0, site-b pausado, site-c sem audiência, site-d com 10 e site-e
 * com 50 nos últimos 30 dias (e 1000 antes deles, fora da janela).
 */
async function seedNetwork(): Promise<void> {
  await db
    .insert(releases)
    .values([{ tag: '1.0.0' }, { tag: '1.1.0' }, { tag: '1.2.0', pipelineState: 'gerando' }]);
  await site('site-e');
  await site('site-d');
  await site('site-c');
  await site('site-b', { state: 'pausado', pausedReason: 'manual' });
  await site('site-a', { release: '1.1.0' });
  await views('site-d', '2026-11-10', 10);
  await views('site-e', '2026-10-20', 30);
  await views('site-e', '2026-11-12', 20);
  await views('site-e', '2026-10-01', 1000);
}

const totals = async () => ({
  rollouts: (await db.select({ n: count() }).from(releaseRollouts))[0]?.n,
  rolloutSites: (await db.select({ n: count() }).from(releaseRolloutSites))[0]?.n,
  pending: (await db.select({ n: count() }).from(pendingChanges))[0]?.n,
  builds: (await db.select({ n: count() }).from(builds))[0]?.n,
  events: (await db.select({ n: count() }).from(siteEvents))[0]?.n,
});

const start = (actor: Actor = operacao) => db.transaction((tx) => startRollout(tx, actor, now));

describe('iniciar a atualização de todos os sites (#700)', () => {
  it('grava o destino e os sites por audiência crescente, com o estado de cada um', async () => {
    await seedNetwork();

    const result = await start();

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value).toMatchObject({
      targetRelease: '1.1.0',
      state: 'em_andamento',
      requestedBy: 'operacao@exemplo.com',
      finishedAt: null,
    });
    const rows = await db
      .select({
        siteId: releaseRolloutSites.siteId,
        position: releaseRolloutSites.position,
        state: releaseRolloutSites.state,
        previousRelease: releaseRolloutSites.previousRelease,
      })
      .from(releaseRolloutSites)
      .orderBy(asc(releaseRolloutSites.position));
    expect(rows).toEqual([
      { siteId: 'site-a', position: 0, state: 'atualizado', previousRelease: '1.1.0' },
      { siteId: 'site-b', position: 1, state: 'nao_atualizado', previousRelease: '1.0.0' },
      { siteId: 'site-c', position: 2, state: 'em_andamento', previousRelease: '1.0.0' },
      { siteId: 'site-d', position: 3, state: 'aguardando', previousRelease: '1.0.0' },
      { siteId: 'site-e', position: 4, state: 'aguardando', previousRelease: '1.0.0' },
    ]);
  });

  it('o primeiro a atualizar fica promovendo, com troca de versão, mudança pendente e build já', async () => {
    await seedNetwork();

    await start();

    const states = await db
      .select({ id: sites.id, state: sites.state, release: sites.release })
      .from(sites)
      .orderBy(asc(sites.id));
    expect(states).toEqual([
      { id: 'site-a', state: 'ativo', release: '1.1.0' },
      { id: 'site-b', state: 'pausado', release: '1.0.0' },
      { id: 'site-c', state: 'promovendo', release: '1.1.0' },
      { id: 'site-d', state: 'ativo', release: '1.0.0' },
      { id: 'site-e', state: 'ativo', release: '1.0.0' },
    ]);
    expect(await db.select().from(siteEvents)).toEqual([
      expect.objectContaining({
        siteId: 'site-c',
        kind: 'troca_de_versao',
        requestedBy: 'operacao@exemplo.com',
        previousRelease: '1.0.0',
        release: '1.1.0',
      }),
    ]);
    expect(
      await db
        .select({
          siteId: pendingChanges.siteId,
          origin: pendingChanges.origin,
          reference: pendingChanges.reference,
        })
        .from(pendingChanges),
    ).toEqual([{ siteId: 'site-c', origin: 'release', reference: '1.1.0' }]);
    expect(
      await db
        .select({
          siteId: builds.siteId,
          status: builds.status,
          scheduledFor: builds.scheduledFor,
          requestedBy: builds.requestedBy,
        })
        .from(builds),
    ).toEqual([
      {
        siteId: 'site-c',
        status: 'na_fila',
        scheduledFor: now,
        requestedBy: 'operacao@exemplo.com',
      },
    ]);
  });

  it('recusa com uma atualização em andamento, sem gravar nada', async () => {
    await seedNetwork();
    await start();
    const before = await totals();

    const result = await start();

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'rollout.already_open' })],
    });
    expect(await totals()).toEqual(before);
  });

  it('com a anterior encerrada, inicia outra', async () => {
    await seedNetwork();
    await start();
    await db.update(releaseRollouts).set({ state: 'concluida', finishedAt: now });

    expect(await start()).toMatchObject({ ok: true });
  });

  it('recusa sem release disponivel, sem gravar nada', async () => {
    await db.insert(releases).values({ tag: '1.0.0', pipelineState: 'gerando' });
    await site('site-a', { release: null });

    expect(await start()).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'rollout.no_release' })],
    });
    expect(await totals()).toEqual({
      rollouts: 0,
      rolloutSites: 0,
      pending: 0,
      builds: 0,
      events: 0,
    });
  });

  it('recusa sem site a atualizar (todos no destino ou pausados), sem gravar nada', async () => {
    await db.insert(releases).values({ tag: '1.1.0' });
    await site('site-a', { release: '1.1.0' });
    await site('site-b', { state: 'pausado', pausedReason: 'manual' });

    expect(await start()).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'rollout.nothing_to_update' })],
    });
    expect(await totals()).toEqual({
      rollouts: 0,
      rolloutSites: 0,
      pending: 0,
      builds: 0,
      events: 0,
    });
  });

  it('recusa quem não tem release.promote', async () => {
    await seedNetwork();

    expect(await start(editor)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'forbidden' })],
    });
    expect(await latestRollout(db, editor)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'forbidden' })],
    });
    expect((await totals()).rollouts).toBe(0);
  });
});

describe('progresso da atualização de todos os sites (#700)', () => {
  it('sem nenhuma, devolve null', async () => {
    expect(await latestRollout(db, operacao)).toEqual({ ok: true, value: null });
  });

  it('devolve a mais recente com o estado de cada site, na ordem', async () => {
    await seedNetwork();
    await start();
    await db.update(releaseRollouts).set({ state: 'concluida', finishedAt: now });
    await db.update(sites).set({ state: 'ativo' }).where(eq(sites.id, 'site-c'));
    await db.insert(releases).values({ tag: '1.3.0' });
    const second = await start();
    if (!second.ok) throw new Error(JSON.stringify(second.issues));

    const result = await latestRollout(db, operacao);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value?.id).toBe(second.value.id);
    expect(result.value?.targetRelease).toBe('1.3.0');
    expect(result.value?.sites.map(({ siteId, state }) => [siteId, state])).toEqual([
      ['site-a', 'em_andamento'],
      ['site-b', 'nao_atualizado'],
      ['site-c', 'aguardando'],
      ['site-d', 'aguardando'],
      ['site-e', 'aguardando'],
    ]);
  });
});
