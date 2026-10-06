import { RESOURCES, type Block, type Content } from '@orakel/content-model/v1';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contents, contentVersions } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  createContent,
  listContents,
  listContentVersions,
  updateContent,
  type ContentEdit,
  type EditBlock,
} from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Edição de conteúdo (#40): versões imutáveis, `n` dos blocos só do servidor e leituras.

let db: Db;
let close: () => Promise<void>;
const SITE = 'exemplo-a';

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});

const text = (value: string) => [
  { type: 'paragraph' as const, children: [{ type: 'text' as const, text: value }] },
];
const textBlock = (n: number, value: string): Block => ({ n, type: 'text', content: text(value) });
const newText = (value: string, n?: number): EditBlock => ({
  new: true,
  type: 'text',
  content: text(value),
  ...(n === undefined ? {} : { n }),
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

async function latest(contentId: number): Promise<Omit<Content, 'id'>> {
  const rows = await versions(contentId);
  const row = rows.at(-1);
  if (row === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  return row.data;
}

const edit = (contentId: number, input: ContentEdit, actor = SYSTEM_ACTOR, resources = RESOURCES) =>
  db.transaction((tx) => updateContent(tx, actor, SITE, contentId, input, resources));

describe('editar conteúdo', () => {
  it('grava a versão N+1 em rascunho e a N continua idêntica', async () => {
    const [v1] = await versions(1);
    const before = await unresolvedPendingChangeIds(db, SITE);

    const result = await edit(1, { ...(await latest(1)), title: 'Guia revisado' });

    expect(result).toEqual({ ok: true, value: { version: 2 } });
    const rows = await versions(1);
    expect(rows.map((row) => [row.version, row.status])).toEqual([
      [1, 'publicado'],
      [2, 'rascunho'],
    ]);
    expect(rows[0]).toEqual(v1);
    expect(rows[1]?.data.title).toBe('Guia revisado');
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(before.length + 1);
  });

  it('bloco novo depois de remover o 2 recebe n = 4, nunca 2', async () => {
    const created = await db.transaction((tx) =>
      createContent(tx, SYSTEM_ACTOR, SITE, {
        kind: 'page',
        slug: 'tres-blocos',
        title: 'Três blocos',
        authorIds: [],
        taxonomyIds: [],
        publishedAt: '2026-10-06T12:00:00-03:00',
        blocks: [textBlock(1, 'um'), textBlock(2, 'dois'), textBlock(3, 'três')],
      }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));
    const id = created.value.id;
    const current = await latest(id);

    // Remove o 2, cria outro e reordena: novo, 3, 1.
    const result = await edit(id, {
      ...current,
      blocks: [newText('novo'), textBlock(3, 'três'), textBlock(1, 'um')],
    });

    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect((await latest(id)).blocks.map((block) => block.n)).toEqual([4, 3, 1]);
    const [row] = await db
      .select({ nextBlockN: contents.nextBlockN })
      .from(contents)
      .where(and(eq(contents.siteId, SITE), eq(contents.id, id)));
    expect(row?.nextBlockN).toBe(5);

    // O 2 removido não volta, nem como bloco existente.
    expect(await edit(id, { ...current, blocks: [textBlock(2, 'dois de volta')] })).toMatchObject({
      ok: false,
      issues: [{ code: 'content.block_unknown', path: ['blocks', 0, 'n'] }],
    });
  });

  it('ignora o n enviado para bloco novo e recusa n inexistente, sem gravar', async () => {
    const current = await latest(3);
    const before = await unresolvedPendingChangeIds(db, SITE);

    expect(
      await edit(3, { ...current, blocks: [...current.blocks, newText('outro', 99)] }),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect((await latest(3)).blocks.map((block) => block.n)).toEqual([1, 2]);

    const refused = await edit(3, { ...current, blocks: [textBlock(99, 'inventado')] });
    expect(refused).toMatchObject({ ok: false, issues: [{ code: 'content.block_unknown' }] });
    expect((await versions(3)).length).toBe(2);
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(before.length + 1);
  });

  it('bloco de tipo fora dos recursos é recusado sem gravar nada', async () => {
    const withoutFaq = {
      ...RESOURCES,
      blockTypes: RESOURCES.blockTypes.filter((t) => t !== 'faq'),
    };
    const before = await unresolvedPendingChangeIds(db, SITE);

    const result = await edit(1, await latest(1), SYSTEM_ACTOR, withoutFaq);

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'semantic.supported-resources' }],
    });
    expect((await versions(1)).length).toBe(1);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(before);
  });

  it('recusa referência inexistente, troca de kind e conteúdo inexistente', async () => {
    const current = await latest(2);

    expect(await edit(2, { ...current, authorIds: [999] })).toMatchObject({ ok: false });
    expect(await edit(2, { ...current, kind: 'page' })).toMatchObject({
      ok: false,
      issues: [{ code: 'content.kind_mismatch' }],
    });
    expect(await edit(999, current)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
    expect((await versions(2)).length).toBe(1);
  });

  it.each(['revisor', 'operacao'] as const)('%s recebe forbidden ao editar', async (role) => {
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(await edit(1, await latest(1), actor)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect((await versions(1)).length).toBe(1);
  });
});

describe('leituras de conteúdo', () => {
  it('a lista traz tipo, título e status da versão mais recente', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    const second = (await latest(2)).title;

    const result = await listContents(db, SYSTEM_ACTOR, SITE);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(
      result.value.map(({ id, kind, title, status, version }) => ({
        id,
        kind,
        title,
        status,
        version,
      })),
    ).toEqual([
      { id: 1, kind: 'article', title: 'Guia revisado', status: 'rascunho', version: 2 },
      { id: 2, kind: 'article', title: second, status: 'publicado', version: 1 },
      { id: 3, kind: 'page', title: 'Quem somos', status: 'publicado', version: 1 },
    ]);
  });

  it('as versões de um conteúdo vêm em ordem; inexistente é recusado', async () => {
    const current = await latest(3);
    await edit(3, { ...current, title: 'Quem somos (2)' });
    await edit(3, { ...current, title: 'Quem somos (3)' });

    const result = await listContentVersions(db, SYSTEM_ACTOR, SITE, 3);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.map((v) => [v.version, v.data.title])).toEqual([
      [1, 'Quem somos'],
      [2, 'Quem somos (2)'],
      [3, 'Quem somos (3)'],
    ]);
    expect(await listContentVersions(db, SYSTEM_ACTOR, SITE, 999)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
  });

  it.each(['editor', 'revisor', 'operacao'] as const)(
    '%s lê a lista e as versões',
    async (role) => {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      expect(await listContents(db, actor, SITE)).toMatchObject({ ok: true });
      expect(await listContentVersions(db, actor, SITE, 1)).toMatchObject({ ok: true });
    },
  );

  it('sem papel, forbidden', async () => {
    const nobody = { email: 'x@orakel.local', roles: [] };
    expect(await listContents(db, nobody, SITE)).toMatchObject({ issues: [{ code: 'forbidden' }] });
  });
});
