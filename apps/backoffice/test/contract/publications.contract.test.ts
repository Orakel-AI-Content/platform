import { parseSnapshotLine } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions, publications, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { submitForReview, updateContent } from '../../src/domain/content/contents.ts';
import { openSnapshot } from '../../src/domain/export/snapshot.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  configureDailyPublishLimit,
  publishVersion,
} from '../../src/domain/publications/publish.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Publicação de uma versão aprovada dentro do limite diário do site (#486, workspace#20).

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const role = (name: 'editor' | 'revisor'): Actor => ({
  email: `${name}@orakel.local`,
  roles: [name],
});

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});
afterEach(() => {
  configureDailyPublishLimit(3);
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/** Nova versão (com o título dado), enviada para revisão e, se pedido, aprovada. */
async function prepare(contentId: number, title?: string, approve = true): Promise<number> {
  const last = (await versions(contentId)).at(-1);
  if (last === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  const data = title === undefined ? last.data : { ...last.data, title };
  const saved = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, data),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  if (approve) {
    const approved = await db.transaction((tx) =>
      approveVersion(tx, role('revisor'), SITE, contentId, saved.value.version, ALL),
    );
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
  }
  return saved.value.version;
}

const publish = (contentId: number, version: number, now?: Date, actor = role('revisor')) =>
  db.transaction((tx) =>
    publishVersion(tx, actor, SITE, contentId, version, now === undefined ? {} : { now }),
  );

/** Prepara uma versão aprovada do conteúdo e a publica no instante dado. */
async function publishAt(contentId: number, at: string) {
  return publish(contentId, await prepare(contentId), new Date(at));
}

async function buildJobs() {
  const { rows } = await db.execute<{ key: string; run_at: Date }>(
    sql`select key, run_at from graphile_worker.jobs where task_identifier = 'build'`,
  );
  return rows;
}

async function publishedTitles(): Promise<Map<number, string>> {
  const opened = await openSnapshot(db, SITE, 'published');
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues));
  const lines = (await new Response(opened.value).text())
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed = parseSnapshotLine(JSON.parse(line) as unknown);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      return parsed.value;
    });
  const titles = new Map<number, string>();
  for (const line of lines) {
    if (line.type === 'content') titles.set(line.data.id, line.data.title);
  }
  return titles;
}

const setSiteLimit = (limit: number | null) =>
  db.update(sites).set({ dailyPublishLimit: limit }).where(eq(sites.id, SITE));

describe('publicar a versão aprovada', () => {
  it('leva a versão a publicado, grava em publications e agenda o build na janela', async () => {
    const version = await prepare(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    const before = Date.now();

    const result = await publish(1, version);

    expect(result).toMatchObject({ ok: true });
    expect((await versions(1)).at(-1)?.status).toBe('publicado');
    const rows = await db.select().from(publications);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteId: SITE,
      contentId: 1,
      version,
      publishedBy: 'revisor@orakel.local',
      scheduledFor: null,
    });
    expect(rows[0]?.publishedAt).toBeInstanceOf(Date);
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(pending.length + 1);
    const jobs = await buildJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.key).toBe(`build:${SITE}`);
    expect(new Date(jobs[0]?.run_at ?? 0).getTime()).toBeGreaterThan(before);
  });

  it('o snapshot published passa a trazer a versão publicada', async () => {
    const original = (await publishedTitles()).get(1);
    const version = await prepare(1, 'Título da versão publicada');

    expect((await publishedTitles()).get(1)).toBe(original);
    expect(await publish(1, version)).toMatchObject({ ok: true });
    expect((await publishedTitles()).get(1)).toBe('Título da versão publicada');
  });
});

describe('limite diário', () => {
  it('recusa a 4ª do dia de São Paulo e aceita depois da meia-noite de lá', async () => {
    await setSiteLimit(3);
    // 22:00 do dia 30 em São Paulo (01:00 UTC do dia 31): fica no dia anterior.
    expect(await publishAt(1, '2026-10-30T22:00:00-03:00')).toMatchObject({ ok: true });
    expect(await publishAt(1, '2026-10-31T09:00:00-03:00')).toMatchObject({ ok: true });
    // 21:30 e 23:30 de São Paulo: já é o dia 1º em UTC, e ainda contam no dia 31.
    expect(await publishAt(2, '2026-10-31T21:30:00-03:00')).toMatchObject({ ok: true });
    expect(await publishAt(3, '2026-10-31T23:30:00-03:00')).toMatchObject({ ok: true });

    const version = await prepare(1);
    const refused = await publish(1, version, new Date('2026-10-31T23:59:00-03:00'));
    expect(refused).toMatchObject({ ok: false, issues: [{ code: 'publication.daily_limit' }] });
    expect((await versions(1)).at(-1)?.status).toBe('aprovado');
    expect(await db.select().from(publications)).toHaveLength(4);

    const accepted = await publish(1, version, new Date('2026-11-01T00:00:30-03:00'));
    expect(accepted).toMatchObject({ ok: true });
  });

  it('com dailyPublishLimit nulo vale o padrão; com valor próprio, vale o do site', async () => {
    const at = '2026-10-31T10:00:00-03:00';
    configureDailyPublishLimit(1);
    await setSiteLimit(null);
    expect(await publishAt(1, at)).toMatchObject({ ok: true });
    expect(await publishAt(2, at)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.daily_limit' }],
    });

    await setSiteLimit(2);
    const version = (await versions(2)).at(-1)?.version ?? 0;
    expect(await publish(2, version, new Date(at))).toMatchObject({ ok: true });
    expect(await publishAt(3, at)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.daily_limit' }],
    });
  });

  it('duas publicações simultâneas com uma vaga restante: a segunda espera e é recusada', async () => {
    await setSiteLimit(1);
    const [v1, v2] = [await prepare(1), await prepare(2)];
    const at = new Date('2026-10-31T10:00:00-03:00');

    // A publica e segura a transação aberta; B, de outro conteúdo, tenta no meio. Sem a trava
    // do site, B contaria zero (A não confirmou) e passaria do limite.
    let second: ReturnType<typeof publish> | undefined;
    let settled = false;
    const first = await db.transaction(async (tx) => {
      const result = await publishVersion(tx, role('revisor'), SITE, 1, v1, { now: at });
      second = publish(2, v2, at);
      void second.finally(() => (settled = true));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      return result;
    });

    expect(first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.daily_limit' }],
    });
    expect(await db.select().from(publications)).toHaveLength(1);
  });
});

describe('recusas sem gravar nada', () => {
  async function expectNothingWritten(contentId: number, status: string, pending: number[]) {
    expect(await db.select().from(publications)).toEqual([]);
    expect((await versions(contentId)).at(-1)?.status).toBe(status);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
    expect(await buildJobs()).toEqual([]);
  }

  it('sem content.publish', async () => {
    const version = await prepare(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`delete from graphile_worker._private_jobs`);

    const result = await publish(1, version, undefined, role('editor'));

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    await expectNothingWritten(1, 'aprovado', pending);
  });

  it('com a versão mais recente fora de aprovado', async () => {
    const version = await prepare(1, undefined, false);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`delete from graphile_worker._private_jobs`);

    const result = await publish(1, version);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'publication.not_approved' }] });
    await expectNothingWritten(1, 'em_revisao', pending);
  });

  it('com uma versão que não é a mais recente', async () => {
    const approved = await prepare(1);
    await prepare(1, undefined, false);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`delete from graphile_worker._private_jobs`);

    const result = await publish(1, approved);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'publication.not_latest' }] });
    await expectNothingWritten(1, 'em_revisao', pending);
  });
});
