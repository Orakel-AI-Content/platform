import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentVersions } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { GENERATOR_ACTOR, SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  createContent,
  listReviewQueue,
  submitForReview,
  updateContent,
  type ContentEdit,
} from '../../src/domain/content/contents.ts';
import { correctForReview, createForReview } from '../../src/domain/content/generated.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { publishVersion } from '../../src/domain/publications/publish.ts';
import { approveVersion, pendingReturn, returnVersion } from '../../src/domain/reviews/reviews.ts';
import { confirmAndApprove, resetDatabase, setupDatabase } from './helpers.ts';

// Conteúdo do gerador (#539): a rota interna delega a `createForReview` com o
// `GENERATOR_ACTOR`, que cria em revisão e nunca aprova nem publica (RN-GEN-02).

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const editor: Actor = { email: 'editor@orakel.local', roles: ['editor'] };

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

  it('enfileira a checagem de links externos da versão 1 na mesma transação (#745)', async () => {
    const id = await generate();

    const { rows } = await db.execute<{ payload: unknown }>(
      sql`select j.payload from graphile_worker._private_jobs j
        join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = 'check-content-links'`,
    );
    expect(rows).toEqual([{ payload: { siteId: SITE, contentId: id, version: 1 } }]);
  });

  it('o ator do gerador recebe forbidden ao aprovar e ao publicar', async () => {
    const id = await generate();

    const approval = await db.transaction((tx) => approveVersion(tx, GENERATOR_ACTOR, SITE, id, 1));
    expect(approval).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });

    // Mesmo com a versão aprovada por uma pessoa, o gerador não publica.
    const approved = await db.transaction((tx) => confirmAndApprove(tx, revisor, SITE, id, 1));
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

describe('versão corrigida pelo gerador (#799)', () => {
  /** Conteúdo do gerador devolvido pelo revisor: a versão 1 volta a `rascunho`, pendente. */
  async function returned(): Promise<number> {
    const id = await generate();
    const back = await db.transaction((tx) =>
      returnVersion(tx, revisor, SITE, id, 1, 'Corrija o corpo.'),
    );
    if (!back.ok) throw new Error(JSON.stringify(back.issues));
    return id;
  }

  /** Os dados da versão 1 com o corpo trocado: a correção que o modelo devolveria. */
  async function corrected(id: number): Promise<ContentEdit> {
    const base = (await versions(id)).at(-1)?.data;
    if (base === undefined) throw new Error(`conteúdo ${id} sem versão`);
    const [block] = base.blocks;
    if (block === undefined) throw new Error('versão sem blocos');
    return {
      ...base,
      blocks: [
        {
          ...block,
          content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Corpo corrigido.' }] }],
        } as ContentEdit['blocks'][number],
      ],
    };
  }

  it('grava a N+1 em revisão pelo gerador, e a devolução deixa de estar pendente', async () => {
    const id = await returned();

    const result = await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, await corrected(id));

    expect(result).toEqual({ ok: true, value: { id, version: 2 } });
    const rows = await versions(id);
    expect(rows.map((row) => [row.version, row.status, row.createdBy])).toEqual([
      [1, 'rascunho', 'generator'],
      [2, 'em_revisao', 'generator'],
    ]);
    expect(await pendingReturn(db, revisor, SITE, id)).toEqual({ ok: true, value: null });
    const queue = await listReviewQueue(db, revisor, SITE);
    expect(queue.ok && queue.value.map((item) => item.id)).toContain(id);
  });

  it('a versão corrigida não sai da fila pelo gerador: aprovar é forbidden', async () => {
    const id = await returned();
    await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, await corrected(id));

    const approval = await db.transaction((tx) => approveVersion(tx, GENERATOR_ACTOR, SITE, id, 2));

    expect(approval).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect((await versions(id)).at(-1)?.status).toBe('em_revisao');
  });

  it('o editor salvou antes: base desatualizada e a versão do editor fica intacta', async () => {
    const id = await returned();
    const edit = await corrected(id);
    const saved = await db.transaction((tx) =>
      updateContent(tx, editor, SITE, id, { ...edit, title: 'Título do editor' }),
    );
    expect(saved.ok).toBe(true);
    const before = await versions(id);

    const result = await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, edit);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'content.base_outdated' }] });
    expect(await versions(id)).toEqual(before);
  });

  it('a base fora de rascunho (reenviada) é base desatualizada e nada é gravado', async () => {
    const id = await returned();
    const resent = await db.transaction((tx) => submitForReview(tx, editor, SITE, id));
    expect(resent.ok).toBe(true);
    const before = await versions(id);

    const result = await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, await corrected(id));

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'content.base_outdated' }] });
    expect(await versions(id)).toEqual(before);
  });

  it('rascunho sem devolução pendente é base desatualizada e nada é gravado', async () => {
    const draft = await db.transaction(async (tx) =>
      createContent(tx, editor, SITE, await generatedArticle()),
    );
    if (!draft.ok) throw new Error(JSON.stringify(draft.issues));
    const id = draft.value.id;
    const before = await versions(id);

    const result = await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, await corrected(id));

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'content.base_outdated' }] });
    expect(await versions(id)).toEqual(before);
  });

  it('conteúdo igual ao da base é content.unchanged e a devolução continua pendente', async () => {
    const id = await returned();
    const base = (await versions(id)).at(-1)?.data as ContentEdit;

    const result = await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, base);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'content.unchanged' }] });
    expect((await versions(id)).map((row) => [row.version, row.status])).toEqual([[1, 'rascunho']]);
    const pending = await pendingReturn(db, revisor, SITE, id);
    expect(pending.ok && pending.value?.comment).toBe('Corrija o corpo.');
  });

  it('conteúdo inválido para a release devolve as issues e não grava nada', async () => {
    const id = await returned();

    const result = await correctForReview(db, GENERATOR_ACTOR, SITE, id, 1, {
      ...(await corrected(id)),
      slug: 'Slug Inválido',
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.issues.map((issue) => issue.code)).not.toContain(
      'content.base_outdated',
    );
    expect(await versions(id)).toHaveLength(1);
  });

  it('site ou conteúdo inexistente devolve not_found', async () => {
    const id = await returned();
    const edit = await corrected(id);

    expect(await correctForReview(db, GENERATOR_ACTOR, 'nao-existe', id, 1, edit)).toMatchObject({
      ok: false,
      issues: [{ code: 'site.not_found' }],
    });
    expect(await correctForReview(db, GENERATOR_ACTOR, SITE, 99_999, 1, edit)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
  });
});
