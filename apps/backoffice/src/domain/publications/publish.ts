import type { Issue, Result } from '@orakel/content-model';
import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contents, contentVersions, publications, sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';

/** Fuso do dia do limite: sempre o de São Paulo, não o `timeZone` do site (workspace#20). */
export const PUBLISH_DAY_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Limite diário padrão (proposta: 3, calibrado na fase 2). Vem de PUBLISH_DAILY_LIMIT,
 * aplicado na partida de cada processo (runProcess e instrumentation do Next); o domínio não
 * lê o ambiente. Um site pode ter o próprio (`sites.dailyPublishLimit`).
 */
let defaultLimit = 3;

export function configureDailyPublishLimit(limit: number): void {
  defaultLimit = limit;
}

/**
 * Limite que vale para um site: o próprio, senão o padrão. Única regra de precedência, a
 * mesma da janela de agrupamento (`effectiveBuildWindowMs`).
 */
export function effectiveDailyPublishLimit(siteLimit: number | null): number {
  return siteLimit ?? defaultLimit;
}

const refused = (code: string, message: string): Result<never> => ({
  ok: false,
  issues: [{ code, message, path: [] }],
});

const notFound = (siteId: string, contentId: number): Issue => ({
  code: 'content.not_found',
  message: `Conteúdo ${contentId} não encontrado no site ${siteId}`,
  path: [],
});

/** Publicações do site no dia de São Paulo que contém `now` (faixa do índice por site e data). */
async function publishedOnDay(tx: Executor, siteId: string, now: Date): Promise<number> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const dayStart = sql`(date_trunc('day', ${at} at time zone ${PUBLISH_DAY_TIME_ZONE}) at time zone ${PUBLISH_DAY_TIME_ZONE})`;
  const [row] = await tx
    .select({ total: count() })
    .from(publications)
    .where(
      and(
        eq(publications.siteId, siteId),
        gte(publications.publishedAt, dayStart),
        lt(publications.publishedAt, sql`${dayStart} + interval '1 day'`),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Publica a versão aprovada: precisa ser a mais recente e estar `aprovado`, e o site não pode
 * ter chegado ao limite do dia de São Paulo. Leva a versão a `publicado`, grava a linha em
 * `publications` e registra a mudança pendente, que agenda o build na janela do site. Trava a
 * linha de `contents`, como a aprovação, e depois a do site (`for no key update`, que não
 * espera as gravações com chave estrangeira para ele), para duas publicações simultâneas no
 * mesmo site não passarem do limite.
 */
export async function publishVersion(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  options: { now?: Date } = {},
): Promise<Result<{ publicationId: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;
  const now = options.now ?? new Date();

  const [content] = await tx
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)))
    .for('update');
  const [latest] = await tx
    .select({ version: contentVersions.version, status: contentVersions.status })
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, siteId), eq(contentVersions.contentId, contentId)))
    .orderBy(desc(contentVersions.version))
    .limit(1);
  if (content === undefined || latest === undefined) {
    return { ok: false, issues: [notFound(siteId, contentId)] };
  }
  if (latest.version !== version) {
    return refused(
      'publication.not_latest',
      `A versão ${version} não é a mais recente: o conteúdo está na versão ${latest.version}`,
    );
  }
  if (latest.status !== 'aprovado') {
    return refused(
      'publication.not_approved',
      `Só uma versão aprovada pode ser publicada: a versão ${version} está ${latest.status}`,
    );
  }

  const [site] = await tx
    .select({ limit: sites.dailyPublishLimit })
    .from(sites)
    .where(eq(sites.id, siteId))
    .for('no key update');
  if (site === undefined) return { ok: false, issues: [notFound(siteId, contentId)] };
  const limit = effectiveDailyPublishLimit(site.limit);
  const published = await publishedOnDay(tx, siteId, now);
  if (published >= limit) {
    return refused(
      'publication.daily_limit',
      `O site ${siteId} já tem ${published} publicação(ões) hoje (dia de São Paulo), e o limite é ${limit}`,
    );
  }

  await tx
    .update(contentVersions)
    .set({ status: 'publicado' })
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, version),
      ),
    );
  const [publication] = await tx
    .insert(publications)
    .values({ siteId, contentId, version, publishedBy: actor.email, publishedAt: now })
    .returning({ id: publications.id });
  if (publication === undefined) throw new Error('INSERT em publications não devolveu o id');
  await recordPendingChange(tx, siteId, 'content', String(contentId));
  return { ok: true, value: { publicationId: publication.id } };
}
