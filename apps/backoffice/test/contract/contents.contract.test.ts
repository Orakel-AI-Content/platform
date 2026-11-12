import { RESOURCES, type Block, type Content } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import {
  contentLinkChecks,
  contents,
  contentVersions,
  reviewConfirmations,
  reviews,
} from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { GENERATOR_ACTOR, SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  amendInReview,
  countContentsByStatus,
  countReviewQueues,
  createAndSubmit,
  createContent,
  listContents,
  listContentVersions,
  listReviewQueue,
  submitForReview,
  updateAndSubmit,
  updateContent,
  type ContentEdit,
  type EditBlock,
} from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { setAllConfirmations } from '../../src/domain/reviews/confirmations.ts';
import { unpublishContent } from '../../src/domain/publications/unpublish.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { createVolumeSite, seedContents } from '../volume.ts';
import { confirmAndApprove, profileQueries, resetDatabase, setupDatabase } from './helpers.ts';

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

    expect(result).toEqual({ ok: true, value: { version: 2, created: true } });
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

    expect(result).toEqual({ ok: true, value: { version: 2, created: true } });
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
    ).toEqual({ ok: true, value: { version: 2, created: true } });
    expect((await latest(3)).blocks.map((block) => block.n)).toEqual([1, 2]);

    const refused = await edit(3, { ...current, blocks: [textBlock(99, 'inventado')] });
    expect(refused).toMatchObject({ ok: false, issues: [{ code: 'content.block_unknown' }] });
    expect((await versions(3)).length).toBe(2);
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(before.length + 1);
  });

  it('sem alteração não grava nada e devolve a versão atual (#523)', async () => {
    const [before] = await versions(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    const nextBlockN = async () =>
      (
        await db
          .select({ nextBlockN: contents.nextBlockN })
          .from(contents)
          .where(and(eq(contents.siteId, SITE), eq(contents.id, 1)))
      )[0]?.nextBlockN;
    const counter = await nextBlockN();

    // Mesmos dados, com as chaves em outra ordem: a comparação é estrutural.
    const current = await latest(1);
    const reordered = Object.fromEntries(Object.entries(current).reverse()) as typeof current;
    expect(await edit(1, reordered)).toEqual({ ok: true, value: { version: 1, created: false } });

    expect(await versions(1)).toEqual([before]);
    expect(await nextBlockN()).toBe(counter);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it('bloco novo sempre conta como alteração (#523)', async () => {
    const current = await latest(3);

    const result = await edit(3, { ...current, blocks: [...current.blocks, newText('outro')] });

    expect(result).toEqual({ ok: true, value: { version: 2, created: true } });
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

describe('criar conteúdo', () => {
  const article = (blocks: EditBlock[], extra: Partial<ContentEdit> = {}): ContentEdit => ({
    kind: 'article',
    slug: 'novo-artigo',
    title: 'Novo artigo',
    authorIds: [1],
    taxonomyIds: [],
    publishedAt: '2026-10-06T12:00:00-03:00',
    blocks,
    ...extra,
  });
  const create = (input: ContentEdit, actor = SYSTEM_ACTOR) =>
    db.transaction((tx) => createContent(tx, actor, SITE, input));

  it('blocos novos recebem n = 1..k do servidor e nextBlockN fica k+1', async () => {
    const result = await create(
      article([
        newText('um', 50),
        { new: true, type: 'image', mediaId: 1, alt: 'Capa' },
        {
          new: true,
          type: 'faq',
          items: [{ question: 'P?', answer: [{ type: 'text', text: 'R' }] }],
        },
      ]),
    );

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const data = await latest(result.value.id);
    expect(data.blocks.map((block) => [block.n, block.type])).toEqual([
      [1, 'text'],
      [2, 'image'],
      [3, 'faq'],
    ]);
    const [row] = await db
      .select({ nextBlockN: contents.nextBlockN })
      .from(contents)
      .where(and(eq(contents.siteId, SITE), eq(contents.id, result.value.id)));
    expect(row?.nextBlockN).toBe(4);
    expect((await versions(result.value.id)).map((v) => v.status)).toEqual(['rascunho']);
  });

  it('imagem sem alt e sem decorativa é recusada com o caminho do campo', async () => {
    const result = await create(article([{ new: true, type: 'image', mediaId: 1 }]));

    expect(result).toMatchObject({ ok: false, issues: [{ path: ['blocks', 0, 'alt'] }] });
  });

  it('mídia ou autor que não existem no site são recusados e nada é gravado', async () => {
    const before = await listContents(db, SYSTEM_ACTOR, SITE);
    const result = await create(
      article([{ new: true, type: 'image', mediaId: 99, alt: 'x' }], { authorIds: [99] }),
    );

    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'semantic.references', path: ['authorIds', 0] },
        { code: 'semantic.references', path: ['blocks', 0, 'mediaId'] },
      ],
    });
    expect(await listContents(db, SYSTEM_ACTOR, SITE)).toEqual(before);
    // A recusa não gasta ID: o próximo conteúdo criado é o 4.
    const next = await create(article([newText('ok')]));
    expect(next).toMatchObject({ ok: true, value: { id: 4 } });
  });

  it.each(['revisor', 'operacao'] as const)('%s recebe forbidden ao criar', async (role) => {
    const actor = { email: `${role}@orakel.local`, roles: [role] };
    expect(await create(article([newText('x')]), actor)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await listContents(db, SYSTEM_ACTOR, SITE)).toMatchObject({ value: { length: 3 } });
  });
});

const submit = (contentId: number, actor = SYSTEM_ACTOR) =>
  db.transaction((tx) => submitForReview(tx, actor, SITE, contentId));

describe('enviar para revisão (#72)', () => {
  it('a versão mais recente em rascunho passa a em_revisao, sem nova versão nem mudança pendente', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    const [, before] = await versions(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);

    expect(await submit(1)).toEqual({ ok: true, value: { version: 2 } });

    const after = await versions(1);
    expect(after.map((v) => [v.version, v.status])).toEqual([
      [1, 'publicado'],
      [2, 'em_revisao'],
    ]);
    expect(after[1]?.data).toEqual(before?.data);
    expect(after[1]?.createdAt).toEqual(before?.createdAt);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it('enfileira a checagem de links externos da versão na mesma transação (#745)', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });

    await submit(1);

    const { rows } = await db.execute<{ payload: unknown; key: string }>(
      sql`select j.payload, j.key from graphile_worker._private_jobs j
        join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = 'check-content-links'`,
    );
    expect(rows).toEqual([
      { payload: { siteId: SITE, contentId: 1, version: 2 }, key: `content-links:${SITE}:1:2` },
    ]);
    expect(await db.select().from(contentLinkChecks)).toMatchObject([
      { siteId: SITE, contentId: 1, version: 2, finishedAt: null },
    ]);
  });

  it('envio recusado não enfileira a checagem de links (#745)', async () => {
    expect(await submit(2)).toMatchObject({ ok: false });

    const { rows } = await db.execute(
      sql`select 1 from graphile_worker.jobs where task_identifier = 'check-content-links'`,
    );
    expect(rows).toEqual([]);
    expect(await db.select().from(contentLinkChecks)).toEqual([]);
  });

  it('recusa versão mais recente fora de rascunho e conteúdo inexistente', async () => {
    expect(await submit(2)).toMatchObject({ ok: false, issues: [{ code: 'content.not_draft' }] });
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);
    expect(await submit(1)).toMatchObject({ ok: false, issues: [{ code: 'content.not_draft' }] });
    expect(await submit(999)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
    expect((await versions(2)).map((v) => v.status)).toEqual(['publicado']);
  });

  it.each(['revisor', 'operacao'] as const)('%s não envia', async (role) => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });

    const result = await submit(1, { email: `${role}@orakel.local`, roles: [role] });

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect((await versions(1)).at(-1)?.status).toBe('rascunho');
  });

  it('editor envia', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    expect(await submit(1, { email: 'editor@orakel.local', roles: ['editor'] })).toMatchObject({
      ok: true,
    });
  });
});

describe('salvar e enviar para revisão (#778)', () => {
  const article: ContentEdit = {
    kind: 'article',
    slug: 'novo-artigo',
    title: 'Novo artigo',
    authorIds: [1],
    taxonomyIds: [],
    publishedAt: '2026-10-06T12:00:00-03:00',
    blocks: [newText('corpo')],
  };
  const createSubmit = (input: ContentEdit, actor = SYSTEM_ACTOR) =>
    db.transaction((tx) => createAndSubmit(tx, actor, SITE, input));
  const editSubmit = (contentId: number, input: ContentEdit, actor = SYSTEM_ACTOR) =>
    db.transaction((tx) => updateAndSubmit(tx, actor, SITE, contentId, input));
  const linkCheckJobs = async () =>
    (
      await db.execute<{ payload: unknown }>(
        sql`select j.payload from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'check-content-links'`,
      )
    ).rows.map((row) => row.payload);

  it('criar e enviar grava a versão 1 já em_revisao e enfileira a checagem de links', async () => {
    const result = await createSubmit(article);

    expect(result).toEqual({ ok: true, value: { id: 4, version: 1 } });
    expect((await versions(4)).map((v) => [v.version, v.status, v.createdBy])).toEqual([
      [1, 'em_revisao', SYSTEM_ACTOR.email],
    ]);
    expect(await linkCheckJobs()).toEqual([{ siteId: SITE, contentId: 4, version: 1 }]);
  });

  it('criar e enviar recusado na gravação não grava conteúdo nem enfileira nada', async () => {
    const before = await listContents(db, SYSTEM_ACTOR, SITE);

    const result = await createSubmit({ ...article, authorIds: [99] });

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'semantic.references' }] });
    expect(await listContents(db, SYSTEM_ACTOR, SITE)).toEqual(before);
    expect(await linkCheckJobs()).toEqual([]);
  });

  it('editar e enviar grava a N+1 já em_revisao, com a N intacta', async () => {
    const result = await editSubmit(1, { ...(await latest(1)), title: 'Guia revisado' });

    expect(result).toEqual({ ok: true, value: { version: 2, created: true } });
    expect((await versions(1)).map((v) => [v.version, v.status, v.data.title])).toEqual([
      [1, 'publicado', expect.any(String)],
      [2, 'em_revisao', 'Guia revisado'],
    ]);
    expect(await linkCheckJobs()).toEqual([{ siteId: SITE, contentId: 1, version: 2 }]);
  });

  it('editar sem alteração, com a mais recente em rascunho, envia essa versão sem criar outra', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });

    const result = await editSubmit(1, await latest(1));

    expect(result).toEqual({ ok: true, value: { version: 2, created: false } });
    expect((await versions(1)).map((v) => [v.version, v.status])).toEqual([
      [1, 'publicado'],
      [2, 'em_revisao'],
    ]);
  });

  it('editar sem alteração, com a mais recente fora de rascunho, recusa com not_draft e não grava', async () => {
    const before = await versions(2);
    const pending = await unresolvedPendingChangeIds(db, SITE);

    const result = await editSubmit(2, await latest(2));

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'content.not_draft' }] });
    expect(await versions(2)).toEqual(before);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
    expect(await linkCheckJobs()).toEqual([]);
  });

  it('editar e enviar recusado na gravação não grava a N+1', async () => {
    const before = await versions(1);

    const result = await editSubmit(1, { ...(await latest(1)), authorIds: [99] });

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'semantic.references' }] });
    expect(await versions(1)).toEqual(before);
    expect(await linkCheckJobs()).toEqual([]);
  });

  it.each(['revisor', 'operacao'] as const)(
    '%s recebe forbidden e nada é gravado',
    async (role) => {
      const actor = { email: `${role}@orakel.local`, roles: [role] };
      const before = await versions(1);

      expect(await createSubmit(article, actor)).toMatchObject({
        ok: false,
        issues: [{ code: 'forbidden' }],
      });
      expect(
        await editSubmit(1, { ...(await latest(1)), title: 'Guia revisado' }, actor),
      ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
      expect(await versions(1)).toEqual(before);
      expect(await listContents(db, SYSTEM_ACTOR, SITE)).toMatchObject({ value: { length: 3 } });
    },
  );
});

describe('fila de revisão (#72)', () => {
  const queue = async (siteId = SITE, actor = SYSTEM_ACTOR) => {
    const result = await listReviewQueue(db, actor, siteId);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value;
  };

  it('lista só os conteúdos com a versão mais recente em revisão, da mais antiga à mais recente', async () => {
    await edit(3, { ...(await latest(3)), title: 'Quem somos (2)' });
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await edit(2, { ...(await latest(2)), title: 'Outro guia' });
    await submit(3);
    await submit(1);

    expect(
      (await queue()).map(({ id, kind, title, version }) => ({ id, kind, title, version })),
    ).toEqual([
      { id: 3, kind: 'page', title: 'Quem somos (2)', version: 2 },
      { id: 1, kind: 'article', title: 'Guia revisado', version: 2 },
    ]);
  });

  it('salvar uma versão nova tira o conteúdo da fila', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);
    expect((await queue()).map((item) => item.id)).toEqual([1]);

    await edit(1, { ...(await latest(1)), title: 'Guia (3)' });

    expect(await queue()).toEqual([]);
  });

  it('salvar sem alteração mantém o conteúdo na fila e a versão em revisão (#523)', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);

    expect(await edit(1, await latest(1))).toEqual({
      ok: true,
      value: { version: 2, created: false },
    });

    expect((await queue()).map(({ id, version }) => ({ id, version }))).toEqual([
      { id: 1, version: 2 },
    ]);
    expect((await versions(1)).map((v) => [v.version, v.status])).toEqual([
      [1, 'publicado'],
      [2, 'em_revisao'],
    ]);
  });

  it('não traz conteúdos de outro site', async () => {
    const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-b'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);

    expect(await queue('exemplo-b')).toEqual([]);
  });

  it('revisor lê a fila; sem papel, forbidden', async () => {
    expect(
      await listReviewQueue(db, { email: 'revisor@orakel.local', roles: ['revisor'] }, SITE),
    ).toMatchObject({ ok: true });
    expect(await listReviewQueue(db, { email: 'x@orakel.local', roles: [] }, SITE)).toMatchObject({
      issues: [{ code: 'forbidden' }],
    });
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

  it('a lista diz se o conteúdo está no ar pela versão no ar, não pela mais recente (#495)', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    const unpublished = await db.transaction((tx) => unpublishContent(tx, SYSTEM_ACTOR, SITE, 2));
    if (!unpublished.ok) throw new Error(JSON.stringify(unpublished.issues));
    await edit(2, { ...(await latest(2)), title: 'Outro guia' });
    const created = await db.transaction((tx) =>
      createContent(tx, SYSTEM_ACTOR, SITE, {
        kind: 'page',
        slug: 'rascunho-novo',
        title: 'Rascunho novo',
        authorIds: [],
        taxonomyIds: [],
        publishedAt: '2026-10-06T12:00:00-03:00',
        blocks: [newText('um')],
      }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.issues));

    const result = await listContents(db, SYSTEM_ACTOR, SITE);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.map(({ id, status, live }) => ({ id, status, live }))).toEqual([
      // Rascunho sobre a versão publicada: continua no ar.
      { id: 1, status: 'rascunho', live: true },
      // Despublicado, com rascunho por cima: a versão publicada anterior não volta ao ar.
      { id: 2, status: 'rascunho', live: false },
      { id: 3, status: 'publicado', live: true },
      { id: created.value.id, status: 'rascunho', live: false },
    ]);
  });

  it('a lista traz os autores na ordem de authorIds e o slug da versão no ar (#587)', async () => {
    // Rascunho com outro slug e autores trocados sobre a versão publicada: o slug no ar continua.
    await edit(1, { ...(await latest(1)), slug: 'guia-novo', authorIds: [2, 1] });
    const unpublished = await db.transaction((tx) => unpublishContent(tx, SYSTEM_ACTOR, SITE, 2));
    if (!unpublished.ok) throw new Error(JSON.stringify(unpublished.issues));

    const result = await listContents(db, SYSTEM_ACTOR, SITE);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(
      result.value.map(({ id, slug, liveSlug, authors }) => ({ id, slug, liveSlug, authors })),
    ).toEqual([
      { id: 1, slug: 'guia-novo', liveSlug: 'guia-completo', authors: ['Bruno Lima', 'Ana Souza'] },
      // Fora do ar: sem slug no ar.
      { id: 2, slug: 'rotina-da-manha', liveSlug: null, authors: ['Bruno Lima'] },
      { id: 3, slug: 'quem-somos', liveSlug: 'quem-somos', authors: [] },
    ]);
  });

  it('com 2.000 conteúdos de duas versões, a lista traz só a mais recente em menos de 500 ms (#105)', async () => {
    const template = await latest(1);
    const ids = Array.from({ length: 2000 }, (_, index) => 1001 + index);
    await db
      .insert(contents)
      .values(ids.map((id) => ({ siteId: SITE, id, kind: 'article' as const })));
    await db.insert(contentVersions).values(
      ids.flatMap((id) =>
        [1, 2].map((version) => ({
          siteId: SITE,
          contentId: id,
          version,
          status: version === 2 ? ('rascunho' as const) : ('publicado' as const),
          data: { ...template, title: `Conteúdo ${id} v${version}`, slug: `conteudo-${id}` },
        })),
      ),
    );

    const started = performance.now();
    const result = await listContents(db, SYSTEM_ACTOR, SITE);
    const elapsed = performance.now() - started;

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const bulk = result.value.filter((item) => item.id > 1000);
    expect(bulk).toHaveLength(2000);
    expect(Object.keys(bulk[0] ?? {}).sort()).toEqual(
      [
        'authors',
        'id',
        'kind',
        'live',
        'liveSlug',
        'slug',
        'status',
        'title',
        'updatedAt',
        'version',
      ].sort(),
    );
    expect(bulk[0]).toMatchObject({
      id: 1001,
      kind: 'article',
      title: 'Conteúdo 1001 v2',
      slug: 'conteudo-1001',
      status: 'rascunho',
      version: 2,
      live: true,
    });
    expect(bulk[0]?.updatedAt).toBeInstanceOf(Date);
    expect(bulk.every((item) => item.version === 2 && item.title.endsWith(' v2'))).toBe(true);
    expect(elapsed).toBeLessThan(500);
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

  it('cada versão traz a aprovação (revisor e data) ou nula, sem duplicar linhas (#76)', async () => {
    await edit(3, { ...(await latest(3)), title: 'Quem somos (2)' });
    await submit(3);
    const approved = await db.transaction((tx) =>
      confirmAndApprove(tx, { email: 'revisor@orakel.local', roles: ['revisor'] }, SITE, 3, 2),
    );
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
    const [review] = await db.select().from(reviews);

    const result = await listContentVersions(db, SYSTEM_ACTOR, SITE, 3);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value).toHaveLength(2);
    expect(result.value.map((v) => [v.version, v.approval])).toEqual([
      [1, null],
      [2, { reviewer: 'revisor@orakel.local', approvedAt: review?.createdAt }],
    ]);
  });

  it('cada versão traz o e-mail de quem a criou, generator no gerador e nulo nas antigas (#748)', async () => {
    const page = (slug: string): ContentEdit => ({
      kind: 'page',
      slug,
      title: slug,
      authorIds: [],
      taxonomyIds: [],
      publishedAt: '2026-10-06T12:00:00-03:00',
      blocks: [newText('um')],
    });
    const editor = { email: 'editor@orakel.local', roles: ['editor' as const] };
    const other = { email: 'outro@orakel.local', roles: ['editor' as const] };
    const created = await db.transaction((tx) => createContent(tx, editor, SITE, page('autoria')));
    if (!created.ok) throw new Error(JSON.stringify(created.issues));
    await edit(created.value.id, { ...(await latest(created.value.id)), title: 'Editada' }, other);
    const generated = await db.transaction((tx) =>
      createContent(tx, GENERATOR_ACTOR, SITE, page('gerada')),
    );
    if (!generated.ok) throw new Error(JSON.stringify(generated.issues));
    // Versão anterior à coluna: o autor fica nulo.
    await edit(3, { ...(await latest(3)), title: 'Quem somos (2)' }, editor);
    await db
      .update(contentVersions)
      .set({ createdBy: null })
      .where(
        and(
          eq(contentVersions.siteId, SITE),
          eq(contentVersions.contentId, 3),
          eq(contentVersions.version, 1),
        ),
      );

    const authorship = async (contentId: number) => {
      const result = await listContentVersions(db, SYSTEM_ACTOR, SITE, contentId);
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      return result.value.map((v) => [v.version, v.createdBy]);
    };

    expect(await authorship(created.value.id)).toEqual([
      [1, 'editor@orakel.local'],
      [2, 'outro@orakel.local'],
    ]);
    expect(await authorship(generated.value.id)).toEqual([[1, 'generator']]);
    expect(await authorship(3)).toEqual([
      [1, null],
      [2, 'editor@orakel.local'],
    ]);
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

describe('tamanho da fila de revisão por site (#583)', () => {
  const counts = async (actor = SYSTEM_ACTOR) => {
    const result = await countReviewQueues(db, actor);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value;
  };

  it('conta por site os conteúdos com a versão mais recente em revisão, numa consulta só', async () => {
    const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-b'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
    expect(await counts()).toEqual({});

    await edit(3, { ...(await latest(3)), title: 'Quem somos (2)' });
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await edit(2, { ...(await latest(2)), title: 'Outro guia' });
    await submit(3);
    await submit(1);

    const { result, queries } = await profileQueries(db, (traced) =>
      countReviewQueues(traced, SYSTEM_ACTOR),
    );
    expect(result).toEqual({ ok: true, value: { [SITE]: 2 } });
    expect(queries).toBe(1);
  });

  it('salvar uma versão nova tira o conteúdo da contagem', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);
    expect(await counts()).toEqual({ [SITE]: 1 });

    await edit(1, { ...(await latest(1)), title: 'Guia (3)' });

    expect(await counts()).toEqual({});
  });

  it('revisor lê a contagem; sem papel, forbidden', async () => {
    expect(
      await countReviewQueues(db, { email: 'revisor@orakel.local', roles: ['revisor'] }),
    ).toMatchObject({ ok: true });
    expect(await countReviewQueues(db, { email: 'x@orakel.local', roles: [] })).toMatchObject({
      issues: [{ code: 'forbidden' }],
    });
  });
});

describe('contagem por status da Visão geral (#596)', () => {
  const counts = async (siteId = SITE) => {
    const result = await countContentsByStatus(db, SYSTEM_ACTOR, siteId);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value;
  };
  // O oráculo: o status da versão mais recente de cada conteúdo, como a lista o mostra.
  const tally = async () => {
    const listed = await listContents(db, SYSTEM_ACTOR, SITE);
    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    const byStatus: Record<string, number> = {};
    for (const item of listed.value) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    return byStatus;
  };
  const nonZero = (value: Record<string, number>) =>
    Object.fromEntries(Object.entries(value).filter(([, total]) => total > 0));

  it('conta pela versão mais recente, como a lista, numa consulta só', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await edit(2, { ...(await latest(2)), title: 'Outro guia' });
    await submit(2);

    const { result, queries } = await profileQueries(db, (traced) =>
      countContentsByStatus(traced, SYSTEM_ACTOR, SITE),
    );
    expect(queries).toBe(1);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(nonZero(result.value)).toEqual(await tally());
    expect(result.value.em_revisao).toBe(1);
  });

  it('salvar uma versão nova move o conteúdo de status', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);
    expect((await counts()).em_revisao).toBe(1);

    await edit(1, { ...(await latest(1)), title: 'Guia (3)' });

    const after = await counts();
    expect(after.em_revisao).toBe(0);
    expect(nonZero(after)).toEqual(await tally());
  });

  it('site sem conteúdo devolve todos os status com zero', async () => {
    await createVolumeSite(db, 'sem-conteudo');
    expect(await counts('sem-conteudo')).toEqual({
      rascunho: 0,
      em_revisao: 0,
      aprovado: 0,
      agendado: 0,
      publicado: 0,
      despublicado: 0,
      substituido: 0,
    });
  });

  it('editor lê a contagem; sem papel, forbidden', async () => {
    expect(
      await countContentsByStatus(db, { email: 'editor@orakel.local', roles: ['editor'] }, SITE),
    ).toMatchObject({ ok: true });
    expect(
      await countContentsByStatus(db, { email: 'x@orakel.local', roles: [] }, SITE),
    ).toMatchObject({ issues: [{ code: 'forbidden' }] });
  });
});

// Rede de 5 sites com 2.000 conteúdos cada: com um site só na tabela, o Seq Scan é o plano
// certo (ele lê a tabela inteira), e o teste não diria se a consulta usa o índice do site.
const VOLUME_SITES = ['volume', 'vizinho-1', 'vizinho-2', 'vizinho-3', 'vizinho-4'];

describe('lista com 2.000 conteúdos (#461)', () => {
  it('lê por índice, sem Seq Scan, em menos de 300 ms', async () => {
    for (const siteId of VOLUME_SITES) {
      await createVolumeSite(db, siteId);
      await seedContents(db, siteId, { count: 2000, pageEvery: 10, promoEvery: 20 });
    }

    const { result, ms, seqScans } = await profileQueries(db, (traced) =>
      listContents(traced, SYSTEM_ACTOR, 'volume'),
    );

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value).toHaveLength(2000);
    expect(result.value.filter((item) => item.title.startsWith('Promoção'))).toHaveLength(100);
    expect(seqScans).not.toContain('content_versions');
    expect(seqScans).not.toContain('contents');
    expect(ms).toBeLessThan(300);
  });
});

describe('corrigir em revisão (#750)', () => {
  const REVISOR = { email: 'revisor@orakel.local', roles: ['revisor' as const] };
  const EDITOR = { email: 'editor@orakel.local', roles: ['editor' as const] };

  const amend = (contentId: number, version: number, input: ContentEdit, actor: Actor = REVISOR) =>
    db.transaction((tx) => amendInReview(tx, actor, SITE, contentId, version, input));

  /** Conteúdo 1 com a versão 2 em revisão e as três confirmações gravadas pelo revisor. */
  async function inReview() {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    await submit(1);
    const confirmed = await db.transaction((tx) =>
      setAllConfirmations(tx, REVISOR, SITE, 1, 2, true),
    );
    if (!confirmed.ok) throw new Error(JSON.stringify(confirmed.issues));
  }

  const confirmationsOf = async (version: number) =>
    (
      await db
        .select({ key: reviewConfirmations.key, confirmedBy: reviewConfirmations.confirmedBy })
        .from(reviewConfirmations)
        .where(
          and(
            eq(reviewConfirmations.siteId, SITE),
            eq(reviewConfirmations.contentId, 1),
            eq(reviewConfirmations.version, version),
          ),
        )
        .orderBy(asc(reviewConfirmations.key))
    ).map((row) => row.key);

  it('grava a N+1 em revisão com o revisor como autor e leva a N a substituido', async () => {
    await inReview();
    const pending = await unresolvedPendingChangeIds(db, SITE);

    const result = await amend(1, 2, { ...(await latest(1)), title: 'Guia corrigido' });

    expect(result).toEqual({ ok: true, value: { version: 3, created: true } });
    const rows = await versions(1);
    expect(rows.map((row) => [row.version, row.status, row.createdBy])).toEqual([
      [1, 'publicado', 'system'],
      [2, 'substituido', 'system'],
      [3, 'em_revisao', REVISOR.email],
    ]);
    expect(rows[2]?.data.title).toBe('Guia corrigido');
    expect((await unresolvedPendingChangeIds(db, SITE)).length).toBe(pending.length + 1);
  });

  it('a fila e o selo contam o conteúdo uma vez, pela N+1', async () => {
    await inReview();

    await amend(1, 2, { ...(await latest(1)), title: 'Guia corrigido' });

    const queue = await listReviewQueue(db, SYSTEM_ACTOR, SITE);
    expect(queue.ok && queue.value.map(({ id, version }) => ({ id, version }))).toEqual([
      { id: 1, version: 3 },
    ]);
    expect(await countReviewQueues(db, SYSTEM_ACTOR)).toEqual({ ok: true, value: { [SITE]: 1 } });
  });

  it('metadado que não é texto mantém valor original e políticas e derruba a visualização', async () => {
    await inReview();

    await amend(1, 2, { ...(await latest(1)), publishedAt: '2026-11-01T12:00:00-03:00' });

    expect(await confirmationsOf(3)).toEqual(['politicas_anuncios_afiliados', 'valor_original']);
    const [kept] = await db
      .select({ confirmedBy: reviewConfirmations.confirmedBy })
      .from(reviewConfirmations)
      .where(and(eq(reviewConfirmations.siteId, SITE), eq(reviewConfirmations.version, 3)));
    expect(kept?.confirmedBy).toBe(REVISOR.email);
    expect(await confirmationsOf(2)).toHaveLength(3);
  });

  it.each([
    ['o título', (data: Omit<Content, 'id'>) => ({ ...data, title: 'Guia corrigido' })],
    ['a descrição', (data: Omit<Content, 'id'>) => ({ ...data, description: 'Outra descrição' })],
    [
      'os blocos',
      (data: Omit<Content, 'id'>): ContentEdit => ({
        ...data,
        blocks: [...data.blocks, newText('mais um parágrafo')],
      }),
    ],
  ])('mudar %s derruba as três confirmações', async (_what, change) => {
    await inReview();

    expect(await amend(1, 2, change(await latest(1)))).toMatchObject({
      ok: true,
      value: { version: 3 },
    });

    expect(await confirmationsOf(3)).toEqual([]);
  });

  it('dados iguais não criam versão nem mexem nas confirmações', async () => {
    await inReview();
    const pending = await unresolvedPendingChangeIds(db, SITE);

    expect(await amend(1, 2, await latest(1))).toEqual({
      ok: true,
      value: { version: 2, created: false },
    });

    expect((await versions(1)).map((v) => [v.version, v.status])).toEqual([
      [1, 'publicado'],
      [2, 'em_revisao'],
    ]);
    expect(await confirmationsOf(2)).toHaveLength(3);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it('enfileira a checagem de links da versão nova (#745)', async () => {
    await inReview();

    await amend(1, 2, { ...(await latest(1)), title: 'Guia corrigido' });

    const { rows } = await db.execute<{ key: string }>(
      sql`select j.key from graphile_worker._private_jobs j
        join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = 'check-content-links' order by j.key`,
    );
    expect(rows.map((row) => row.key)).toEqual([
      `content-links:${SITE}:1:2`,
      `content-links:${SITE}:1:3`,
    ]);
    expect(
      await db
        .select({ version: contentLinkChecks.version })
        .from(contentLinkChecks)
        .where(eq(contentLinkChecks.version, 3)),
    ).toEqual([{ version: 3 }]);
  });

  it('recusa versão fora de revisão: rascunho, aprovado e publicado', async () => {
    await edit(1, { ...(await latest(1)), title: 'Guia revisado' });
    expect(await amend(1, 2, await latest(1))).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_in_review' }],
    });

    expect(await amend(2, 1, { ...(await latest(2)), title: 'Outro' })).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_in_review' }],
    });

    await submit(1);
    const approved = await db.transaction((tx) => confirmAndApprove(tx, REVISOR, SITE, 1, 2));
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
    expect(await amend(1, 2, { ...(await latest(1)), title: 'Guia corrigido' })).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_in_review' }],
    });
    expect((await versions(1)).map((v) => v.status)).toEqual(['publicado', 'aprovado']);
  });

  it('recusa versão que não é a mais recente, sem gravar nada', async () => {
    await inReview();

    expect(await amend(1, 1, { ...(await latest(1)), title: 'Guia corrigido' })).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_latest' }],
    });
    expect(await versions(1)).toHaveLength(2);
  });

  it('o editor é recusado em amendInReview, e o revisor continua recusado em updateContent', async () => {
    await inReview();

    expect(
      await amend(1, 2, { ...(await latest(1)), title: 'Guia corrigido' }, EDITOR),
    ).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect(await edit(1, { ...(await latest(1)), title: 'Guia corrigido' }, REVISOR)).toMatchObject(
      { ok: false, issues: [{ code: 'forbidden' }] },
    );
    expect(await versions(1)).toHaveLength(2);
  });
});
