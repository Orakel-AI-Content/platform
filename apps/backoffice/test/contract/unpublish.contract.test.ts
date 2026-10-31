import { parseSnapshotLine } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions, publications, redirects, sites } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  createContent,
  liveSlug,
  submitForReview,
  updateContent,
} from '../../src/domain/content/contents.ts';
import { openSnapshot } from '../../src/domain/export/snapshot.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  configureDailyPublishLimit,
  publishVersion,
} from '../../src/domain/publications/publish.ts';
import { unpublishContent } from '../../src/domain/publications/unpublish.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Despublicação com 301 opcional (#491, workspace#20). Na fixture exemplo-a, o conteúdo 1
// está no ar em /guia-completo/ (com /guia-antigo/ → /guia-completo/), o 2 em
// /rotina-da-manha/.

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
  configureDailyPublishLimit(100);
});
afterEach(() => {
  configureDailyPublishLimit(3);
});

async function versions(contentId: number) {
  return db
    .select({ version: contentVersions.version, status: contentVersions.status })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/** Nova versão (com as mudanças dadas), enviada para revisão e aprovada. */
async function approved(contentId: number, changes: { title?: string; slug?: string } = {}) {
  const [last] = await db
    .select({ data: contentVersions.data })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(sql`${contentVersions.version} desc`)
    .limit(1);
  if (last === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  const saved = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, { ...last.data, ...changes }),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  const ok = await db.transaction((tx) =>
    approveVersion(tx, role('revisor'), SITE, contentId, saved.value.version, ALL),
  );
  if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
  return saved.value.version;
}

const publish = (contentId: number, version: number, now?: Date) =>
  db.transaction((tx) =>
    publishVersion(tx, role('revisor'), SITE, contentId, version, now === undefined ? {} : { now }),
  );

const unpublish = (contentId: number, to?: number, actor = role('revisor')) =>
  db.transaction((tx) =>
    unpublishContent(tx, actor, SITE, contentId, to === undefined ? {} : { to }),
  );

async function publishedIds(): Promise<number[]> {
  const opened = await openSnapshot(db, SITE, 'published');
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues));
  return (await new Response(opened.value).text())
    .split('\n')
    .filter((line) => line !== '')
    .flatMap((line) => {
      const parsed = parseSnapshotLine(JSON.parse(line) as unknown);
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      return parsed.value.type === 'content' ? [parsed.value.data.id] : [];
    });
}

async function redirectMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(redirects).where(eq(redirects.siteId, SITE));
  return Object.fromEntries(rows.map((row) => [row.from, row.to]));
}

async function buildJobs() {
  const { rows } = await db.execute<{ key: string }>(
    sql`select key from graphile_worker.jobs where task_identifier = 'build'`,
  );
  return rows;
}

describe('despublicar', () => {
  it('leva a versão no ar a despublicado, registra mudança pendente e sai do build', async () => {
    const pending = await unresolvedPendingChangeIds(db, SITE);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    const live = (await versions(1)).at(-1);

    const result = await unpublish(1);

    expect(result).toEqual({ ok: true, value: { version: live?.version } });
    expect((await versions(1)).at(-1)?.status).toBe('despublicado');
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(pending.length + 1);
    expect(await buildJobs()).toEqual([{ key: `build:${SITE}` }]);
    expect(await publishedIds()).not.toContain(1);
    expect(await publishedIds()).toContain(2);
  });

  it('com as versões 1 e 2 publicadas, o build não traz de volta a 1', async () => {
    expect(await publish(1, await approved(1, { title: 'Versão nova' }))).toMatchObject({
      ok: true,
    });
    const before = await versions(1);
    expect(before.filter((v) => v.status === 'publicado').length).toBeGreaterThanOrEqual(2);

    expect(await unpublish(1)).toMatchObject({ ok: true });

    const after = await versions(1);
    expect(after.at(-1)?.status).toBe('despublicado');
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(await publishedIds()).not.toContain(1);
  });

  it('com destino, grava o 301 e reaponta quem chegava no despublicado', async () => {
    expect(await redirectMap()).toMatchObject({ '/guia-antigo/': '/guia-completo/' });

    const result = await unpublish(1, 2);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const [row] = await db
      .select()
      .from(redirects)
      .where(and(eq(redirects.siteId, SITE), eq(redirects.from, '/guia-completo/')));
    expect(row).toMatchObject({
      id: result.value.redirectId,
      to: '/rotina-da-manha/',
      status: 301,
      origin: 'manual',
    });
    expect(await redirectMap()).toMatchObject({ '/guia-antigo/': '/rotina-da-manha/' });
  });

  it('depois de despublicar, liveSlug some e a nova publicação não grava 301 de slug antigo', async () => {
    // Versão 1 em /guia-completo/ e 2 em /guia-novo/, as duas publicadas; a 2 sai do ar.
    expect(await publish(1, await approved(1, { slug: 'guia-novo' }))).toMatchObject({ ok: true });
    expect(await unpublish(1)).toMatchObject({ ok: true });
    expect(await db.transaction((tx) => liveSlug(tx, SITE, 1))).toBeUndefined();
    const before = await redirectMap();

    expect(await publish(1, await approved(1, { slug: 'guia-de-volta' }))).toMatchObject({
      ok: true,
    });

    expect(await redirectMap()).toEqual(before);
    expect(await publishedIds()).toContain(1);
  });
});

describe('limite diário', () => {
  it('despublicar não altera a contagem do dia nem devolve a vaga', async () => {
    const at = new Date('2026-10-31T10:00:00-03:00');
    await db.update(sites).set({ dailyPublishLimit: 1 }).where(eq(sites.id, SITE));
    expect(await publish(1, await approved(1, { title: 'Hoje' }), at)).toMatchObject({ ok: true });
    const counted = await db.select().from(publications);

    expect(await unpublish(1)).toMatchObject({ ok: true });

    expect(await db.select().from(publications)).toEqual(counted);
    expect(await publish(2, await approved(2), at)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.daily_limit' }],
    });
  });
});

describe('recusas sem gravar nada', () => {
  async function snapshotState() {
    return {
      one: await versions(1),
      two: await versions(2),
      redirects: await redirectMap(),
      pending: await unresolvedPendingChangeIds(db, SITE),
    };
  }

  async function expectRefused(run: () => Promise<unknown>, code: string) {
    const before = await snapshotState();
    expect(await run()).toMatchObject({ ok: false, issues: [{ code }] });
    expect(await snapshotState()).toEqual(before);
  }

  it('sem content.publish', async () => {
    await expectRefused(() => unpublish(1, 2, role('editor')), 'forbidden');
  });

  it('conteúdo que não está no ar', async () => {
    expect(await unpublish(2)).toMatchObject({ ok: true });
    await expectRefused(() => unpublish(2), 'publication.not_live');
    await expectRefused(() => unpublish(999), 'content.not_found');
  });

  it('conteúdo só em rascunho', async () => {
    const [last] = await db
      .select({ data: contentVersions.data })
      .from(contentVersions)
      .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, 1)));
    if (last === undefined) throw new Error('conteúdo 1 sem versão');
    const created = await db.transaction((tx) =>
      createContent(tx, SYSTEM_ACTOR, SITE, { ...last.data, slug: 'so-rascunho' }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));

    await expectRefused(() => unpublish(created.value.id), 'publication.not_live');
    await expectRefused(() => unpublish(1, created.value.id), 'publication.invalid_target');
  });

  it('destino fora do ar, inexistente ou o próprio conteúdo', async () => {
    expect(await unpublish(2)).toMatchObject({ ok: true });
    await expectRefused(() => unpublish(1, 2), 'publication.invalid_target');
    await expectRefused(() => unpublish(1, 999), 'publication.invalid_target');
    await expectRefused(() => unpublish(1, 1), 'publication.invalid_target');
  });
});
