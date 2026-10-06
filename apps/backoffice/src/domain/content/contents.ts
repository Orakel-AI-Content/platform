import type { Issue, Result } from '@orakel/content-model';
import {
  ContentSchema,
  RESOURCES,
  validateContent,
  type Block,
  type Content,
  type Resources,
} from '@orakel/content-model/v1';
import { and, asc, desc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  authors,
  contents,
  contentVersions,
  media,
  taxonomies,
  type CONTENT_STATUSES,
  type ContentData,
} from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

type Status = (typeof CONTENT_STATUSES)[number];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Bloco novo na edição: o `n` vem do servidor (`nextBlockN`); o enviado é ignorado. */
export type NewBlock = DistributiveOmit<Block, 'n'> & { new: true; n?: number };

/** Bloco da edição: existente (com o `n` da versão mais recente) ou novo. */
export type EditBlock = Block | NewBlock;

export type ContentEdit = Omit<Content, 'id' | 'blocks'> & { blocks: EditBlock[] };

const notFound = (siteId: string, contentId: number): Issue => ({
  code: 'content.not_found',
  message: `Conteúdo ${contentId} não encontrado no site ${siteId}`,
  path: [],
});

/** IDs de autores, taxonomias e mídias do site, para conferir as referências. */
async function referenceContext(db: Executor, siteId: string) {
  const ids = async (table: typeof authors | typeof taxonomies | typeof media) =>
    new Set(
      (await db.select({ id: table.id }).from(table).where(eq(table.siteId, siteId))).map(
        (row) => row.id,
      ),
    );
  return {
    authorIds: await ids(authors),
    taxonomyIds: await ids(taxonomies),
    mediaIds: await ids(media),
  };
}

const isNew = (block: EditBlock): block is NewBlock => 'new' in block && block.new === true;

/** Bloco novo com o `n` do servidor (o enviado é descartado). */
function withN(block: NewBlock, n: number): Block {
  const fresh: Record<string, unknown> = { ...block };
  delete fresh.new;
  return { ...fresh, n } as Block;
}

/** Schema e validação semântica (referências do site, recursos); devolve os dados sem ID. */
async function validate(
  tx: Executor,
  siteId: string,
  contentId: number,
  input: Omit<Content, 'id'>,
  resources: Resources = RESOURCES,
): Promise<Result<ContentData>> {
  const parsed = ContentSchema.safeParse({ ...input, id: contentId });
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        code: `schema.${i.code}`,
        message: i.message,
        path: i.path,
      })),
    };
  }
  const semantic = validateContent(parsed.data, await referenceContext(tx, siteId), resources);
  if (!semantic.ok) return semantic;
  const data: Partial<Content> = { ...semantic.value };
  delete data.id;
  return { ok: true, value: data as ContentData };
}

/**
 * Cria um conteúdo com a versão 1, validado como na edição. Bloco novo (`new: true`) recebe
 * o `n` do servidor, acima do maior `n` enviado (a importação traz os `n` do acervo); o
 * próximo número fica acima de todos (nunca reutilizado). `publicado` exige também
 * permissão de publicar. O fluxo de revisão, aprovação, agendamento e o limite diário
 * entram com o módulo Publicação.
 */
export async function createContent(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: ContentEdit,
  options: WriteOptions & { status?: Status; resources?: Resources } = {},
): Promise<Result<{ id: number }>> {
  const status = options.status ?? 'rascunho';
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  if (status === 'publicado') {
    const publish = checkWrite(actor, 'content.publish');
    if (!publish.ok) return publish;
  }

  let nextBlockN =
    Math.max(0, ...input.blocks.flatMap((block) => (isNew(block) ? [] : [block.n]))) + 1;
  const blocks = input.blocks.map((block) => (isNew(block) ? withN(block, nextBlockN++) : block));
  // ID provisório na validação: o definitivo só é alocado depois, para não gastar a sequência.
  const data = await validate(tx, siteId, options.id ?? 1, { ...input, blocks }, options.resources);
  if (!data.ok) return data;

  const id = await allocateId(tx, siteId, 'content', options.id);
  await tx.insert(contents).values({ siteId, id, kind: input.kind, nextBlockN });
  await tx
    .insert(contentVersions)
    .values({ siteId, contentId: id, version: 1, status, data: data.value });
  await recordPendingChange(tx, siteId, 'content', String(id));
  return { ok: true, value: { id } };
}

/**
 * Edita um conteúdo: grava a versão N+1 em `rascunho` (as anteriores ficam intactas). Bloco
 * existente mantém o `n` da versão mais recente; bloco novo recebe `nextBlockN`, em ordem, e
 * o `n` nunca é reutilizado. A linha de `contents` fica travada até o fim da transação: duas
 * edições simultâneas não calculam a mesma versão nem os mesmos `n`.
 */
export async function updateContent(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  input: ContentEdit,
  resources: Resources = RESOURCES,
): Promise<Result<{ version: number }>> {
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;

  const [content] = await tx
    .select({ kind: contents.kind, nextBlockN: contents.nextBlockN })
    .from(contents)
    .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)))
    .for('update');
  const [latest] = await tx
    .select({ version: contentVersions.version, data: contentVersions.data })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, siteId), eq(contentVersions.contentId, contentId)))
    .orderBy(desc(contentVersions.version))
    .limit(1);
  if (content === undefined || latest === undefined) {
    return { ok: false, issues: [notFound(siteId, contentId)] };
  }
  if (input.kind !== content.kind) {
    return {
      ok: false,
      issues: [
        {
          code: 'content.kind_mismatch',
          message: `O tipo do conteúdo não muda: é ${content.kind}`,
          path: ['kind'],
        },
      ],
    };
  }

  // Identidade dos blocos: existente só com `n` da versão mais recente; novo pelo contador.
  const current = new Set(latest.data.blocks.map((block) => block.n));
  const issues: Issue[] = [];
  let nextBlockN = content.nextBlockN;
  const blocks = input.blocks.map((block, index): Block => {
    if (isNew(block)) return withN(block, nextBlockN++);
    if (!current.has(block.n)) {
      issues.push({
        code: 'content.block_unknown',
        message: `O bloco ${String(block.n)} não está na versão ${latest.version}; bloco novo recebe o número do servidor`,
        path: ['blocks', index, 'n'],
      });
    }
    return block;
  });
  if (issues.length > 0) return { ok: false, issues };

  const data = await validate(tx, siteId, contentId, { ...input, blocks }, resources);
  if (!data.ok) return data;

  const version = latest.version + 1;
  await tx
    .insert(contentVersions)
    .values({ siteId, contentId, version, status: 'rascunho', data: data.value });
  await tx
    .update(contents)
    .set({ nextBlockN })
    .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)));
  await recordPendingChange(tx, siteId, 'content', String(contentId));
  return { ok: true, value: { version } };
}

export type ContentListItem = {
  id: number;
  kind: Content['kind'];
  title: string;
  slug: string;
  /** Status e número da versão mais recente. */
  status: Status;
  version: number;
  updatedAt: Date;
};

/** Conteúdos do site com a versão mais recente de cada um, em ordem de ID. */
export async function listContents(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<ContentListItem[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const rows = await db
    .selectDistinctOn([contentVersions.contentId], {
      id: contentVersions.contentId,
      status: contentVersions.status,
      version: contentVersions.version,
      data: contentVersions.data,
      updatedAt: contentVersions.createdAt,
    })
    .from(contentVersions)
    .where(eq(contentVersions.siteId, siteId))
    .orderBy(asc(contentVersions.contentId), desc(contentVersions.version));
  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      kind: row.data.kind,
      title: row.data.title,
      slug: row.data.slug,
      status: row.status,
      version: row.version,
      updatedAt: row.updatedAt,
    })),
  };
}

export type ContentVersion = {
  version: number;
  status: Status;
  createdAt: Date;
  data: ContentData;
};

/** Versões de um conteúdo, da primeira à mais recente. */
export async function listContentVersions(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<ContentVersion[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const rows = await db
    .select({
      version: contentVersions.version,
      status: contentVersions.status,
      createdAt: contentVersions.createdAt,
      data: contentVersions.data,
    })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, siteId), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
  if (rows.length === 0) return { ok: false, issues: [notFound(siteId, contentId)] };
  return { ok: true, value: rows };
}
