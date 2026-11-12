import type { Content } from '@orakel/content-model/v1';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readFixture } from '../../src/bin/seed.ts';
import type { Db } from '../../src/db/client.ts';
import { contentVersions, type ContentData } from '../../src/db/schema/index.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  createContent,
  submitForReview,
  updateContent,
} from '../../src/domain/content/contents.ts';
import { openSnapshot } from '../../src/domain/export/snapshot.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { publishScheduledVersion, publishVersion } from '../../src/domain/publications/publish.ts';
import { schedulePublication } from '../../src/domain/publications/schedule.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Data de publicação automática (#758, ADR 0022): a exportação troca a data da versão pela
// primeira publicação do conteúdo, salvo data definida por pessoa ou vinda da importação.

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const REVIEWER: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const FIRST = new Date('2026-11-04T10:00:00-03:00');
const LATER = new Date('2026-11-06T15:30:00-03:00');

let importedId: number;
let importedData: ContentData;

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const fixture = await readFixture(SITE);
  const result = await importSnapshot(db, SYSTEM_ACTOR, fixture);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const first = fixture.flatMap((line) => (line.type === 'content' ? [line.data] : []))[0];
  if (first === undefined) throw new Error('A fixture precisa de um conteúdo');
  ({ id: importedId, ...importedData } = first);
});

async function exported(contentId: number): Promise<Content | undefined> {
  const opened = await openSnapshot(db, SITE);
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues));
  const text = await new Response(opened.value).text();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { type: string; data: Content })
    .find((line) => line.type === 'content' && line.data.id === contentId)?.data;
}

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/** Conteúdo novo, criado como no editor (data automática), com a data `publishedAt`. */
async function create(publishedAt = '2026-11-01T09:00:00-03:00'): Promise<number> {
  const created = await db.transaction((tx) =>
    createContent(tx, SYSTEM_ACTOR, SITE, { ...importedData, slug: 'artigo-novo', publishedAt }),
  );
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  return created.value.id;
}

/** Salva uma versão nova (título com o número dela), com as mudanças pedidas. */
async function save(contentId: number, changes: Partial<ContentData> = {}): Promise<number> {
  const last = (await versions(contentId)).at(-1);
  if (last === undefined) throw new Error(`conteúdo ${String(contentId)} sem versão`);
  const saved = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, {
      ...last.data,
      title: `${last.data.title} (v${String(last.version + 1)})`,
      ...changes,
    }),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  return saved.value.version;
}

/** Envia a versão mais recente para revisão e a aprova. */
async function approve(contentId: number): Promise<number> {
  const last = (await versions(contentId)).at(-1);
  if (last === undefined) throw new Error(`conteúdo ${String(contentId)} sem versão`);
  await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  const approved = await db.transaction((tx) =>
    approveVersion(tx, REVIEWER, SITE, contentId, last.version, ALL),
  );
  if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
  return last.version;
}

async function publish(contentId: number, now: Date): Promise<void> {
  const version = await approve(contentId);
  const published = await db.transaction((tx) =>
    publishVersion(tx, SYSTEM_ACTOR, SITE, contentId, version, { now }),
  );
  if (!published.ok) throw new Error(JSON.stringify(published.issues));
}

describe('data de publicação na exportação', () => {
  it('data automática publicada na hora sai com o horário da primeira publicação', async () => {
    const id = await create();
    await publish(id, FIRST);
    expect((await exported(id))?.publishedAt).toBe(FIRST.toISOString());
  });

  it('agendado e publicado pelo job sai com o horário marcado', async () => {
    const id = await create();
    const version = await approve(id);
    const scheduled = await db.transaction((tx) =>
      schedulePublication(tx, SYSTEM_ACTOR, SITE, id, version, LATER, { now: FIRST }),
    );
    if (!scheduled.ok) throw new Error(JSON.stringify(scheduled.issues));
    await db.transaction((tx) => publishScheduledVersion(tx, SITE, id, version));
    expect((await exported(id))?.publishedAt).toBe(LATER.toISOString());
  });

  it('data trocada num salvamento sai com a data da versão', async () => {
    const id = await create();
    await save(id, { publishedAt: '2026-10-20T08:00:00-03:00' });
    await publish(id, FIRST);
    expect((await exported(id))?.publishedAt).toBe('2026-10-20T08:00:00-03:00');
  });

  it('publicado de novo (versão nova) mantém a data da primeira publicação', async () => {
    const id = await create();
    await publish(id, FIRST);
    await save(id);
    await publish(id, LATER);
    expect((await exported(id))?.publishedAt).toBe(FIRST.toISOString());
  });

  it('importado, sem publicação, sai com a data da versão', async () => {
    expect((await exported(importedId))?.publishedAt).toBe(importedData.publishedAt);
  });

  it('importado e publicado de novo pelo Backoffice mantém a data importada', async () => {
    await save(importedId);
    await publish(importedId, LATER);
    const content = await exported(importedId);
    expect(content?.title).toContain('(v2)');
    expect(content?.publishedAt).toBe(importedData.publishedAt);
  });
});

describe('marcador da data automática', () => {
  it('nasce ligado e o salvamento que não troca a data o herda', async () => {
    const id = await create();
    await save(id);
    expect((await versions(id)).map((row) => row.publishedAtAuto)).toEqual([true, true]);
  });

  it('o mesmo instante com outro offset não é troca de data', async () => {
    const id = await create('2026-11-01T09:00:00-03:00');
    await save(id, { publishedAt: '2026-11-01T12:00:00Z' });
    expect((await versions(id)).map((row) => row.publishedAtAuto)).toEqual([true, true]);
  });

  it('desliga ao trocar a data e continua desligado nas versões seguintes', async () => {
    const id = await create();
    await save(id, { publishedAt: '2026-10-20T08:00:00-03:00' });
    await save(id);
    expect((await versions(id)).map((row) => row.publishedAtAuto)).toEqual([true, false, false]);
  });

  it('a importação grava desligado', async () => {
    expect((await versions(importedId)).map((row) => row.publishedAtAuto)).toEqual([false]);
  });
});
