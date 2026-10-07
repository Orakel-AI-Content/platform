import { RESOURCES, type Resources } from '@orakel/content-model/v1';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions, reviews } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { submitForReview, updateContent } from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  approveVersion,
  REVIEW_CHECKLIST,
  reviewIssues,
} from '../../src/domain/reviews/reviews.ts';
import type * as Sites from '../../src/domain/sites/sites.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Aprovação da revisão (#73): checklist, validação pela release do site e registro em reviews.

// Recursos da release: `resourcesFor` devolve os RESOURCES até o registro por release
// (workspace#26); aqui o teste troca o retorno para simular uma release sem o bloco faq.
const release = vi.hoisted(() => ({ override: undefined as Resources | undefined }));
vi.mock('../../src/domain/sites/sites.ts', async (importOriginal) => {
  const original = await importOriginal<typeof Sites>();
  return {
    ...original,
    resourcesFor: async (...args: Parameters<typeof original.resourcesFor>) =>
      release.override ?? (await original.resourcesFor(...args)),
  };
});

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const withoutFaq: Resources = {
  ...RESOURCES,
  blockTypes: RESOURCES.blockTypes.filter((t) => t !== 'faq'),
};
const role = (name: 'editor' | 'revisor' | 'operacao' | 'admin'): Actor => ({
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
  release.override = undefined;
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/** Nova versão em rascunho (os mesmos dados) e, se pedido, enviada para revisão. */
async function draft(contentId: number, submit = true): Promise<number> {
  const last = (await versions(contentId)).at(-1);
  if (last === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  const saved = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, last.data),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  if (submit) await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  return saved.value.version;
}

const approve = (
  contentId: number,
  version: number,
  checklist: readonly string[] = ALL,
  actor = role('revisor'),
) => db.transaction((tx) => approveVersion(tx, actor, SITE, contentId, version, checklist));

describe('aprovar a versão em revisão', () => {
  it('grava revisor, versão, checklist e data em reviews e deixa a versão aprovado', async () => {
    const version = await draft(1);
    const before = (await versions(1)).at(-1);
    const pending = await unresolvedPendingChangeIds(db, SITE);

    const result = await approve(1, version);

    expect(result).toMatchObject({ ok: true });
    const rows = await db.select().from(reviews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteId: SITE,
      contentId: 1,
      version,
      reviewer: 'revisor@orakel.local',
      checklist: ALL,
    });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
    const after = (await versions(1)).at(-1);
    expect(after?.status).toBe('aprovado');
    expect(after?.data).toEqual(before?.data);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it('com a release sem um bloco usado no conteúdo, devolve a issue e recusa a aprovação', async () => {
    const version = await draft(1);
    release.override = withoutFaq;

    const issues = await reviewIssues(db, role('editor'), SITE, 1);
    const result = await approve(1, version);

    expect(issues).toMatchObject({
      ok: true,
      value: { version, issues: [{ code: 'semantic.supported-resources' }] },
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'semantic.supported-resources' }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it('recusa checklist incompleto ou com item desconhecido', async () => {
    const version = await draft(1);

    expect(await approve(1, version, ALL.slice(1))).toMatchObject({
      ok: false,
      issues: [{ code: 'review.checklist_incomplete', path: ['checklist'] }],
    });
    expect(await approve(1, version, [...ALL, 'inventado'])).toMatchObject({
      ok: false,
      issues: [{ code: 'review.checklist_incomplete' }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
  });

  it('recusa versão que não é a mais recente e versão fora de em_revisao', async () => {
    const reviewed = await draft(1);
    await draft(1, false);

    expect(await approve(1, reviewed)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_latest' }],
    });
    const latest = (await versions(1)).at(-1)?.version ?? 0;
    expect(await approve(1, latest)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_in_review' }],
    });
    expect(await approve(999, 1)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
    expect((await versions(1)).map((v) => v.status)).not.toContain('aprovado');
  });

  it.each(['editor', 'operacao'] as const)('%s não aprova', async (name) => {
    const version = await draft(1);

    expect(await approve(1, version, ALL, role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it.each(['admin', 'revisor'] as const)('%s aprova', async (name) => {
    const version = await draft(1);

    expect(await approve(1, version, ALL, role(name))).toMatchObject({ ok: true });
  });
});

describe('validação para a tela de revisão', () => {
  it('versão válida não tem issues; sem papel, forbidden', async () => {
    const version = await draft(1);

    expect(await reviewIssues(db, role('revisor'), SITE, 1)).toEqual({
      ok: true,
      value: { version, issues: [] },
    });
    expect(await reviewIssues(db, { email: 'x@orakel.local', roles: [] }, SITE, 1)).toMatchObject({
      issues: [{ code: 'forbidden' }],
    });
    expect(await reviewIssues(db, role('revisor'), SITE, 999)).toMatchObject({
      issues: [{ code: 'content.not_found' }],
    });
  });
});
