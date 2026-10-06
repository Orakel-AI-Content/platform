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

/**
 * Cria um conteúdo com a versão 1. `publicado` exige também permissão de publicar. O
 * próximo número de bloco fica acima do maior `n` usado (nunca reutilizado). O fluxo de
 * revisão, aprovação, agendamento e o limite diário entram com o módulo Publicação.
 */
export async function createContent(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Content, 'id'>,
  options: WriteOptions & { status?: Status } = {},
): Promise<Result<{ id: number }>> {
  const status = options.status ?? 'rascunho';
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  if (status === 'publicado') {
    const publish = checkWrite(actor, 'content.publish');
    if (!publish.ok) return publish;
  }

  const id = await allocateId(tx, siteId, 'content', options.id);
  const nextBlockN = Math.max(0, ...input.blocks.map((block) => block.n)) + 1;
  await tx.insert(contents).values({ siteId, id, kind: input.kind, nextBlockN });
  await tx
    .insert(contentVersions)
    .values({ siteId, contentId: id, version: 1, status, data: input });
  await recordPendingChange(tx, siteId, 'content', String(id));
  return { ok: true, value: { id } };
}

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
    if ('new' in block && block.new === true) {
      const fresh: Record<string, unknown> = { ...block };
      delete fresh.new;
      return { ...fresh, n: nextBlockN++ } as Block;
    }
    const existing = block as Block;
    if (!current.has(existing.n)) {
      issues.push({
        code: 'content.block_unknown',
        message: `O bloco ${String(existing.n)} não está na versão ${latest.version}; bloco novo recebe o número do servidor`,
        path: ['blocks', index, 'n'],
      });
    }
    return existing;
  });
  if (issues.length > 0) return { ok: false, issues };

  const parsed = ContentSchema.safeParse({ ...input, id: contentId, blocks });
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

  const version = latest.version + 1;
  await tx
    .insert(contentVersions)
    .values({ siteId, contentId, version, status: 'rascunho', data: data as ContentData });
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
