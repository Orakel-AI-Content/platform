import type { Content } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import { contentLinkResults, contentVersions } from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import { submitForReview, updateContent } from '../../src/domain/content/contents.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import {
  linkCheckFor,
  recordLinkCheck,
  versionLinks,
  type LinkCheckTarget,
} from '../../src/domain/reviews/link-checks.ts';
import { returnVersion } from '../../src/domain/reviews/reviews.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Checagem dos links externos da revisão (#745): a execução nasce no envio, o job grava o
// resultado por versão e a leitura distingue verificando, sem links e o resultado por link.

let db: Db;
let close: () => Promise<void>;
const SITE = 'exemplo-a';
const revisor: Actor = { email: 'revisor@orakel.local', roles: ['revisor'] };
const FINISHED = new Date('2026-11-12T12:00:00Z');

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});

async function latest(contentId: number): Promise<Omit<Content, 'id'>> {
  const rows = await db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
  const row = rows.at(-1);
  if (row === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  return row.data;
}

const paragraph = (href: string, label: string) => ({
  type: 'paragraph' as const,
  children: [
    { type: 'text' as const, text: 'Veja ' },
    { type: 'link' as const, href, children: [{ type: 'text' as const, text: label }] },
  ],
});

/** Nova versão do conteúdo 1 com links externos, internos e repetidos, e o envio dela. */
async function submitWithLinks(): Promise<LinkCheckTarget> {
  const base = await latest(1);
  const edited = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, 1, {
      ...base,
      blocks: [
        ...base.blocks,
        {
          new: true,
          type: 'text',
          content: [
            paragraph('https://fonte.example/a', 'a fonte'),
            paragraph('https://fonte.example/a', 'de novo'),
            paragraph('/categoria/guias', 'link interno'),
          ],
        },
        {
          new: true,
          type: 'quote',
          content: [{ type: 'text', text: 'Citação.' }],
          sourceUrl: 'http://citacao.example/',
        },
        {
          new: true,
          type: 'faq',
          items: [
            { question: 'Onde?', answer: paragraph('https://faq.example/', 'aqui').children },
          ],
        },
      ],
    }),
  );
  if (!edited.ok) throw new Error(JSON.stringify(edited.issues));
  const submitted = await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));
  if (!submitted.ok) throw new Error(JSON.stringify(submitted.issues));
  return { siteId: SITE, contentId: 1, version: submitted.value.version };
}

const read = (target: LinkCheckTarget) => linkCheckFor(db, revisor, target);

describe('checagem de links externos (#745)', () => {
  it('extrai da versão só os links http(s), um por bloco e URL, com o n do bloco', async () => {
    const target = await submitWithLinks();
    const links = await versionLinks(db, target);
    // Os três blocos acrescentados ficam no fim; os do fixture podem ter links próprios.
    const [textN, quoteN, faqN] = (await latest(1)).blocks.slice(-3).map((block) => block.n);
    const added = [textN, quoteN, faqN];

    expect(links?.filter((link) => added.includes(link.blockN))).toEqual([
      { blockN: textN, url: 'https://fonte.example/a' },
      { blockN: quoteN, url: 'http://citacao.example/' },
      { blockN: faqN, url: 'https://faq.example/' },
    ]);
    expect(await versionLinks(db, { ...target, version: 99 })).toBeUndefined();
  });

  it('enviada e ainda não conferida, a versão lê como verificando', async () => {
    const target = await submitWithLinks();

    expect(await read(target)).toEqual({ ok: true, value: { state: 'verificando' } });
  });

  it('versão sem execução registrada (anterior à checagem) lê como não verificado', async () => {
    expect(await read({ siteId: SITE, contentId: 1, version: 1 })).toEqual({
      ok: true,
      value: { state: 'nao_verificado' },
    });
  });

  it('o resultado gravado volta por link, com o motivo das falhas', async () => {
    const target = await submitWithLinks();

    await db.transaction((tx) =>
      recordLinkCheck(
        tx,
        target,
        [
          { blockN: 9, url: 'https://ok.example/', ok: true },
          { blockN: 3, url: 'https://sumiu.example/', ok: false, reason: 'HTTP 404' },
        ],
        FINISHED,
      ),
    );

    expect(await read(target)).toEqual({
      ok: true,
      value: {
        state: 'verificado',
        links: [
          { blockN: 3, url: 'https://sumiu.example/', ok: false, reason: 'HTTP 404' },
          { blockN: 9, url: 'https://ok.example/', ok: true },
        ],
      },
    });
  });

  it('concluída sem links, a versão lê como sem links externos', async () => {
    const target = await submitWithLinks();

    await db.transaction((tx) => recordLinkCheck(tx, target, [], FINISHED));

    expect(await read(target)).toEqual({ ok: true, value: { state: 'sem_links' } });
  });

  it('rodar o job de novo para a mesma versão troca o resultado, sem duplicar linhas', async () => {
    const target = await submitWithLinks();
    const first = [
      { blockN: 3, url: 'https://a.example/', ok: false as const, reason: 'HTTP 500' },
      { blockN: 4, url: 'https://b.example/', ok: true as const },
    ];

    await db.transaction((tx) => recordLinkCheck(tx, target, first, FINISHED));
    await db.transaction((tx) =>
      recordLinkCheck(tx, target, [{ ...first[0]!, ok: true }, first[1]!], FINISHED),
    );

    const rows = await db.select().from(contentLinkResults);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.ok && row.reason === null)).toBe(true);
  });

  it('reenviar a versão devolvida volta a verificando, com um job só', async () => {
    const target = await submitWithLinks();
    await db.transaction((tx) => recordLinkCheck(tx, target, [], FINISHED));
    const returned = await db.transaction((tx) =>
      returnVersion(tx, revisor, SITE, 1, target.version, 'Corrija a fonte.'),
    );
    expect(returned.ok).toBe(true);

    await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));

    expect(await read(target)).toEqual({ ok: true, value: { state: 'verificando' } });
    const { rows } = await db.execute(
      sql`select 1 from graphile_worker.jobs where task_identifier = 'check-content-links'`,
    );
    expect(rows).toHaveLength(1);
  });
});
