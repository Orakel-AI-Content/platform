import { parseSnapshotLine, validateSnapshot, type Content } from '@orakel/content-model/v1';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions, pendingChanges, redirects } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  createContent,
  submitForReview,
  updateContent,
} from '../../src/domain/content/contents.ts';
import { createRedirect } from '../../src/domain/content/redirects.ts';
import { openSnapshot } from '../../src/domain/export/snapshot.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  configureDailyPublishLimit,
  publishVersion,
} from '../../src/domain/publications/publish.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Troca de endereço na publicação: 301 do caminho antigo, sem cadeias, e recusa do slug em
// uso ao salvar e ao publicar (#489, workspace#20). Na fixture exemplo-a, o conteúdo 1 está
// em /guia-completo/ (com /guia-antigo/ → /guia-completo/), o 2 em /rotina-da-manha/.

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const REVISOR: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };

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

async function latestData(contentId: number): Promise<Omit<Content, 'id'>> {
  const rows = await db
    .select({ data: contentVersions.data })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
  const last = rows.at(-1);
  if (last === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  return last.data;
}

const save = async (contentId: number, slug: string) =>
  db.transaction(async (tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, { ...(await latestData(contentId)), slug }),
  );

/** Nova versão com o slug dado, enviada para revisão e aprovada. */
async function approved(contentId: number, slug: string): Promise<number> {
  const saved = await save(contentId, slug);
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  const ok = await db.transaction((tx) =>
    approveVersion(tx, REVISOR, SITE, contentId, saved.value.version, ALL),
  );
  if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
  return saved.value.version;
}

const publish = (contentId: number, version: number) =>
  db.transaction((tx) => publishVersion(tx, REVISOR, SITE, contentId, version));

/** Publica o conteúdo com o slug dado; falha o teste se a publicação for recusada. */
async function publishSlug(contentId: number, slug: string): Promise<void> {
  const result = await publish(contentId, await approved(contentId, slug));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
}

async function redirectPairs(): Promise<[string, string][]> {
  const rows = await db
    .select({ from: redirects.from, to: redirects.to })
    .from(redirects)
    .where(eq(redirects.siteId, SITE))
    .orderBy(asc(redirects.from));
  return rows.map((row) => [row.from, row.to]);
}

async function pendingRedirectRefs(): Promise<string[]> {
  const rows = await db
    .select({ reference: pendingChanges.reference })
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.siteId, SITE),
        eq(pendingChanges.origin, 'redirect'),
        isNull(pendingChanges.resolvedAt),
      ),
    );
  return rows.map((row) => row.reference);
}

const slugIssue = { ok: false, issues: [expect.objectContaining({ path: ['slug'] })] };

describe('troca de endereço na publicação', () => {
  it('A, depois B, depois C deixa /A/ → /C/ e /B/ → /C/, sem redirect para /B/', async () => {
    await publishSlug(2, 'rotina-b');
    await publishSlug(2, 'rotina-c');

    const pairs = await redirectPairs();
    expect(pairs).toEqual([
      ['/guia-antigo/', '/guia-completo/'],
      ['/rotina-b/', '/rotina-c/'],
      ['/rotina-da-manha/', '/rotina-c/'],
    ]);
    expect(pairs.filter(([, to]) => to === '/rotina-b/')).toEqual([]);
  });

  it('achata também o redirect que já vinha da fixture', async () => {
    await publishSlug(1, 'guia-novo');

    expect(await redirectPairs()).toEqual([
      ['/guia-antigo/', '/guia-novo/'],
      ['/guia-completo/', '/guia-novo/'],
    ]);
  });

  it('voltar ao endereço antigo deixa só /B/ → /A/ e o snapshot published é válido', async () => {
    await publishSlug(2, 'rotina-b');
    await publishSlug(2, 'rotina-da-manha');

    expect(await redirectPairs()).toEqual([
      ['/guia-antigo/', '/guia-completo/'],
      ['/rotina-b/', '/rotina-da-manha/'],
    ]);
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
    expect(validateSnapshot(lines)).toMatchObject({ ok: true });
  });

  it('publicar sem mudança de slug não grava redirect', async () => {
    await publishSlug(2, 'rotina-da-manha');

    expect(await redirectPairs()).toEqual([['/guia-antigo/', '/guia-completo/']]);
  });

  it('registra mudança pendente de cada redirect inserido, reapontado ou removido', async () => {
    await publishSlug(2, 'rotina-b');
    const [first] = await db
      .select({ id: redirects.id })
      .from(redirects)
      .where(and(eq(redirects.siteId, SITE), eq(redirects.from, '/rotina-da-manha/')));
    await db.delete(pendingChanges);

    await publishSlug(2, 'rotina-c');
    const [second] = await db
      .select({ id: redirects.id })
      .from(redirects)
      .where(and(eq(redirects.siteId, SITE), eq(redirects.from, '/rotina-b/')));
    expect((await pendingRedirectRefs()).sort()).toEqual(
      [String(first?.id), String(second?.id)].sort(),
    );

    // Voltar a /rotina-b/ remove o redirect que saía dele e reaponta o de /rotina-da-manha/.
    await db.delete(pendingChanges);
    await publishSlug(2, 'rotina-b');
    const [third] = await db
      .select({ id: redirects.id })
      .from(redirects)
      .where(and(eq(redirects.siteId, SITE), eq(redirects.from, '/rotina-c/')));
    expect((await pendingRedirectRefs()).sort()).toEqual(
      [String(first?.id), String(second?.id), String(third?.id)].sort(),
    );
  });
});

describe('slug em uso', () => {
  it('editar com o slug de outro conteúdo é recusado no path slug', async () => {
    expect(await save(2, 'guia-completo')).toEqual(slugIssue);
  });

  it('criar com o slug de outro conteúdo é recusado no path slug', async () => {
    const created = await db.transaction(async (tx) =>
      createContent(tx, SYSTEM_ACTOR, SITE, await latestData(1)),
    );
    expect(created).toEqual(slugIssue);
  });

  it('o slug no ar de outro conteúdo continua em uso enquanto o rascunho dele troca', async () => {
    const draft = await save(1, 'guia-rascunho');
    expect(draft).toMatchObject({ ok: true });

    expect(await save(2, 'guia-completo')).toEqual(slugIssue);
    expect(await save(2, 'guia-rascunho')).toEqual(slugIssue);
  });

  it('editar com a origem de um redirect de outro conteúdo é recusado no path slug', async () => {
    expect(await save(2, 'guia-antigo')).toEqual(slugIssue);
  });

  it('criar com a origem de um redirect é recusado no path slug', async () => {
    const created = await db.transaction(async (tx) =>
      createContent(tx, SYSTEM_ACTOR, SITE, {
        ...(await latestData(2)),
        slug: 'guia-antigo',
      }),
    );
    expect(created).toEqual(slugIssue);
  });

  it('a origem de um redirect para o próprio conteúdo está livre para ele', async () => {
    expect(await save(1, 'guia-antigo')).toMatchObject({ ok: true });
  });

  it('publicar com um slug tomado depois da aprovação é recusado no path slug', async () => {
    const version = await approved(2, 'rotina-livre');
    const manual = await db.transaction((tx) =>
      createRedirect(tx, SYSTEM_ACTOR, SITE, {
        from: '/rotina-livre/',
        to: '/guia-completo/',
        status: 301,
        origin: 'manual',
      }),
    );
    expect(manual).toMatchObject({ ok: true });

    expect(await publish(2, version)).toEqual(slugIssue);
  });
});
