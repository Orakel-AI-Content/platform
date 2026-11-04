import type { Result } from '@orakel/content-model';
import { desc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { editorialContexts, sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';

// Contexto editorial do site para a geração (RN-GEN-05): versões imutáveis, a nova é a
// última + 1, como `site_configs`. O contexto não vai para o site: gravar não registra
// mudança pendente. Escrever exige `content.write`, como os textos institucionais.

export type EditorialContext = {
  version: number;
  body: string;
  /** E-mail de quem criou. */
  createdBy: string;
  createdAt: Date;
};

const COLUMNS = {
  version: editorialContexts.version,
  body: editorialContexts.body,
  createdBy: editorialContexts.createdBy,
  createdAt: editorialContexts.createdAt,
};

/** Todas as versões do site, da mais recente para a primeira. */
export async function listEditorialContexts(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<EditorialContext[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db
    .select(COLUMNS)
    .from(editorialContexts)
    .where(eq(editorialContexts.siteId, siteId))
    .orderBy(desc(editorialContexts.version));
  return { ok: true, value: rows };
}

/**
 * Grava a versão N+1 do contexto do site; as anteriores ficam intactas. Duas gravações
 * simultâneas na mesma versão: a segunda falha pela chave primária, sem sobrescrever.
 */
export async function createEditorialContext(
  tx: Executor,
  actor: Actor,
  siteId: string,
  body: string,
): Promise<Result<{ version: number }>> {
  const allowed = requireRole(actor, 'content.write');
  if (!allowed.ok) return allowed;

  const text = typeof body === 'string' ? body.trim() : '';
  if (text === '') {
    return {
      ok: false,
      issues: [
        {
          code: 'editorial_context.empty',
          message: 'Escreva o contexto editorial',
          path: ['body'],
        },
      ],
    };
  }
  const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  const current = await latest(tx, siteId);
  const version = (current?.version ?? 0) + 1;
  await tx
    .insert(editorialContexts)
    .values({ siteId, version, body: text, createdBy: actor.email });
  return { ok: true, value: { version } };
}

/**
 * Versão atual do contexto do site, ou `undefined` sem nenhuma. Sem ator, como
 * `currentConfig`: leitura interna da geração; a permissão fica em quem a dispara.
 */
export async function currentEditorialContext(
  db: Executor,
  siteId: string,
): Promise<EditorialContext | undefined> {
  return latest(db, siteId);
}

async function latest(db: Executor, siteId: string): Promise<EditorialContext | undefined> {
  const [row] = await db
    .select(COLUMNS)
    .from(editorialContexts)
    .where(eq(editorialContexts.siteId, siteId))
    .orderBy(desc(editorialContexts.version))
    .limit(1);
  return row;
}
