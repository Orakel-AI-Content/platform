import { getTableName, sql, type Table } from 'drizzle-orm';

import { readFixture } from '../src/bin/seed.ts';
import type { Executor } from '../src/db/client.ts';
import {
  contents,
  contentVersions,
  media,
  mediaUploads,
  mediaVariants,
} from '../src/db/schema/index.ts';
import { SYSTEM_ACTOR } from '../src/domain/access/rbac.ts';
import { createSite } from '../src/domain/sites/sites.ts';

// Listas grandes gravadas direto no banco, em lote: o contrato mede a consulta com 2.000
// linhas (#461) e o E2E usa as mesmas sementes com poucas linhas. Quem chama remove o site.

/**
 * Atualiza as estatísticas do Postgres das tabelas que um teste acabou de carregar em massa.
 *
 * Os testes inserem e consultam em seguida, antes de o autovacuum rodar o `ANALYZE` (cerca de
 * um minuto depois). Sem estatísticas, o planejador acha as tabelas quase vazias e escolhe um
 * Nested Loop que, na busca da biblioteca de mídia, compara cada mídia com todos os envios do
 * site: 4 milhões de `ilike`, cerca de 0,8 s por consulta (#186). Com as estatísticas, o mesmo
 * plano é um Hash Join de 1 ms. Num banco em uso as estatísticas já existem; aqui o teste as
 * cria — e antes de qualquer `EXPLAIN`, que sem elas mostra um plano que o banco real não usa.
 */
export async function analyzeTables(db: Pick<Executor, 'execute'>, ...tables: Table[]) {
  const names = tables.map((table) => `"${getTableName(table)}"`).join(', ');
  await db.execute(sql.raw(`analyze ${names}`));
}

/** Site vazio com a configuração de `exemplo-b`, para receber uma lista grande. */
export async function createVolumeSite(db: Executor, siteId: string): Promise<void> {
  const config = (await readFixture('exemplo-b')).find((line) => line.type === 'config');
  if (config?.type !== 'config') throw new Error('fixture sem config');
  const site = await db.transaction((tx) =>
    createSite(tx, SYSTEM_ACTOR, {
      ...config.data,
      siteId,
      name: `Site ${siteId}`,
      domains: [`${siteId}.example.com`],
    }),
  );
  if (!site.ok) throw new Error(JSON.stringify(site.issues));
}

const range = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

/**
 * `count` conteúdos de IDs 1…count, uma versão cada. Um em `pageEvery` é página e os demais
 * artigos; um em `promoEvery` se chama "Promoção <id>" (a busca sem acento por "promocao"
 * acha `count / promoEvery`), os demais "Receita <id>". Pares publicados, ímpares rascunho.
 */
export async function seedContents(
  db: Executor,
  siteId: string,
  { count, pageEvery, promoEvery }: { count: number; pageEvery: number; promoEvery: number },
): Promise<void> {
  const content = (await readFixture('exemplo-b')).find((line) => line.type === 'content');
  if (content?.type !== 'content') throw new Error('fixture sem conteúdo');
  // Sem o ID do conteúdo da fixture (o JSONB não guarda o ID; undefined some no JSON).
  const template = { ...content.data, id: undefined };
  const kind = (id: number) => (id % pageEvery === 0 ? ('page' as const) : ('article' as const));
  const title = (id: number) => (id % promoEvery === 0 ? `Promoção ${id}` : `Receita ${id}`);
  const ids = range(count);
  await db.transaction(async (tx) => {
    await tx
      .insert(contents)
      .values(ids.map((id) => ({ siteId, id, kind: kind(id), nextBlockN: 1 })));
    await tx.insert(contentVersions).values(
      ids.map((id) => ({
        siteId,
        contentId: id,
        version: 1,
        status: id % 2 === 0 ? ('publicado' as const) : ('rascunho' as const),
        data: {
          ...template,
          kind: kind(id),
          title: title(id),
          slug: `conteudo-${id}`,
          authorIds: [],
          taxonomyIds: [],
          blocks: [],
        },
      })),
    );
  });
  await analyzeTables(db, contents, contentVersions);
}

/**
 * `count` mídias 800×600 de IDs 1…count, com uma variante de 400 px cada. Com `promoEvery`,
 * cada mídia tem o envio `pronta` que a gerou, "Promoção <id>.jpg" a cada `promoEvery` e
 * "foto-<id>.jpg" nas demais (a busca da biblioteca é pelo nome do envio); sem ele, a mídia
 * fica sem envio, como as importadas.
 */
export async function seedMedia(
  db: Executor,
  siteId: string,
  { count, promoEvery }: { count: number; promoEvery?: number },
): Promise<void> {
  const ids = range(count);
  await db.transaction(async (tx) => {
    await tx.insert(media).values(ids.map((id) => ({ siteId, id, width: 800, height: 600 })));
    await tx.insert(mediaVariants).values(
      ids.map((id) => ({
        siteId,
        mediaId: id,
        width: 400,
        format: 'webp',
        path: `${siteId}/h${id}-400.webp`,
      })),
    );
    if (promoEvery === undefined) return;
    await tx.insert(mediaUploads).values(
      ids.map((id) => ({
        uploadKey: `uploads/${siteId}/${id}.jpg`,
        siteId,
        originalName: id % promoEvery === 0 ? `Promoção ${id}.jpg` : `foto-${id}.jpg`,
        status: 'pronta' as const,
        mediaId: id,
      })),
    );
  });
  await analyzeTables(db, media, mediaVariants, mediaUploads);
}
