import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { GENERATOR_ACTOR, SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { listReviewQueue, type ContentEdit } from '../../src/domain/content/contents.ts';
import { createForReview } from '../../src/domain/content/generated.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { publishVersion } from '../../src/domain/publications/publish.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Conteúdo do gerador (#539): a rota interna delega a `createForReview` com o
// `GENERATOR_ACTOR`, que cria em revisão e nunca aprova nem publica (RN-GEN-02).

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/** Artigo novo a partir do conteúdo 1 do fixture, com slug e título próprios. */
async function generatedArticle(): Promise<ContentEdit> {
  const base = (await versions(1)).at(-1)?.data;
  if (base === undefined) throw new Error('conteúdo 1 sem versão');
  return {
    ...base,
    title: 'Artigo gerado',
    slug: 'artigo-gerado',
    blocks: [
      {
        new: true,
        type: 'text',
        content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Corpo gerado.' }] }],
      },
    ],
  };
}

async function generate(): Promise<number> {
  const created = await createForReview(db, GENERATOR_ACTOR, SITE, await generatedArticle());
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  return created.value.id;
}

describe('conteúdo do gerador', () => {
  it('cria a versão 1 em revisão e o conteúdo entra na fila de revisão do site', async () => {
    const created = await createForReview(db, GENERATOR_ACTOR, SITE, await generatedArticle());

    expect(created).toMatchObject({ ok: true, value: { version: 1 } });
    if (!created.ok) return;
    const rows = await versions(created.value.id);
    expect(rows.map((row) => [row.version, row.status])).toEqual([[1, 'em_revisao']]);
    const queue = await listReviewQueue(db, revisor, SITE);
    expect(queue.ok && queue.value.map((item) => item.id)).toContain(created.value.id);
  });

  it('o ator do gerador recebe forbidden ao aprovar e ao publicar', async () => {
    const id = await generate();

    const approval = await db.transaction((tx) =>
      approveVersion(tx, GENERATOR_ACTOR, SITE, id, 1, ALL),
    );
    expect(approval).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });

    // Mesmo com a versão aprovada por uma pessoa, o gerador não publica.
    const approved = await db.transaction((tx) => approveVersion(tx, revisor, SITE, id, 1, ALL));
    expect(approved.ok).toBe(true);
    const publication = await db.transaction((tx) =>
      publishVersion(tx, GENERATOR_ACTOR, SITE, id, 1),
    );
    expect(publication).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect((await versions(id)).map((row) => row.status)).toEqual(['aprovado']);
  });

  it('conteúdo inválido devolve as issues e não grava nada', async () => {
    const before = await db.select().from(contentVersions);
    const invalid = { ...(await generatedArticle()), slug: 'Slug Inválido' };

    const result = await createForReview(db, GENERATOR_ACTOR, SITE, invalid);

    expect(result.ok).toBe(false);
    expect(await db.select().from(contentVersions)).toHaveLength(before.length);
  });

  it('site inexistente devolve site.not_found', async () => {
    expect(
      await createForReview(db, GENERATOR_ACTOR, 'nao-existe', await generatedArticle()),
    ).toMatchObject({ ok: false, issues: [{ code: 'site.not_found' }] });
  });
});
