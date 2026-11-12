import { RESOURCES, type Block, type Content } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import {
  contentLinkChecks,
  contents,
  contentVersions,
  reviews,
} from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
  countContentsByStatus,
  countReviewQueues,
  createContent,
  listContents,
  listContentVersions,
  listReviewQueue,
  submitForReview,
  updateContent,
  type ContentEdit,
  type EditBlock,
} from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { unpublishContent } from '../../src/domain/publications/unpublish.ts';
import { approveVersion, REVIEW_CHECKLIST } from '../../src/domain/reviews/reviews.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { createVolumeSite, seedContents } from '../volume.ts';
import { profileQueries, resetDatabase, setupDatabase } from './helpers.ts';

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
      approveVersion(
        tx,
        { email: 'revisor@orakel.local', roles: ['revisor'] },
        SITE,
        3,
        2,
        REVIEW_CHECKLIST.map((item) => item.key),
      ),
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
