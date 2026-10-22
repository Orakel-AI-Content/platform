import { RESOURCES, type Block, type Content } from '@orakel/content-model/v1';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contents, contentVersions, reviews } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import {
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

  it('recusa versão mais recente fora de rascunho e conteúdo inexistente', async () => {
    expect(await submit(2)).toMatchObject({ ok: false, issues: [{ code: 'content.not_draft' }] });
    await edit(1, await latest(1));
    await submit(1);
    expect(await submit(1)).toMatchObject({ ok: false, issues: [{ code: 'content.not_draft' }] });
    expect(await submit(999)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
    expect((await versions(2)).map((v) => v.status)).toEqual(['publicado']);
  });

  it.each(['revisor', 'operacao'] as const)('%s não envia', async (role) => {
    await edit(1, await latest(1));

    const result = await submit(1, { email: `${role}@orakel.local`, roles: [role] });

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect((await versions(1)).at(-1)?.status).toBe('rascunho');
  });

  it('editor envia', async () => {
    await edit(1, await latest(1));
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
    await edit(2, await latest(2));
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
    await edit(1, await latest(1));
    await submit(1);
    expect((await queue()).map((item) => item.id)).toEqual([1]);

    await edit(1, { ...(await latest(1)), title: 'Guia (3)' });

    expect(await queue()).toEqual([]);
  });

  it('não traz conteúdos de outro site', async () => {
    const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-b'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
    await edit(1, await latest(1));
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
      ['id', 'kind', 'slug', 'status', 'title', 'updatedAt', 'version'].sort(),
    );
    expect(bulk[0]).toMatchObject({
      id: 1001,
      kind: 'article',
      title: 'Conteúdo 1001 v2',
      slug: 'conteudo-1001',
      status: 'rascunho',
      version: 2,
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
