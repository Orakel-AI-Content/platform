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

/**
 * Publicações do site no dia de São Paulo que contém `at` (faixa do índice por site e data).
 * Conta as feitas e as agendadas: a reserva do agendamento grava `published_at` no horário
 * marcado (schedule.ts).
 */
async function publishedOnDay(tx: Executor, siteId: string, at: Date): Promise<number> {
  const instant = sql`${at.toISOString()}::timestamptz`;
  const dayStart = sql`(date_trunc('day', ${instant} at time zone ${PUBLISH_DAY_TIME_ZONE}) at time zone ${PUBLISH_DAY_TIME_ZONE})`;
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

const dayLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: PUBLISH_DAY_TIME_ZONE });

/**
 * Confere se a versão pode ocupar uma vaga no dia de São Paulo que contém `day`: precisa ser a
 * mais recente e estar `aprovado`, e o site não pode ter chegado ao limite daquele dia. Trava
 * a linha de `contents`, como a aprovação, e depois a do site (`for no key update`, que não
 * espera as gravações com chave estrangeira para ele), para duas publicações simultâneas no
 * mesmo site não passarem do limite. Usada pela publicação e pelo agendamento.
 */
export async function reservePublicationSlot(
  tx: Executor,
  siteId: string,
  contentId: number,
  version: number,
  day: { at: Date; today: boolean },
): Promise<Result<void>> {
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
  const published = await publishedOnDay(tx, siteId, day.at);
  if (published >= limit) {
    const when = day.today ? 'hoje' : `em ${dayLabel.format(day.at)}`;
    return refused(
      'publication.daily_limit',
      `O site ${siteId} já tem ${published} publicação(ões) ${when} (dia de São Paulo), e o limite é ${limit}`,
    );
  }
  return { ok: true, value: undefined };
}

/** Leva a versão a `publicado` e registra a mudança pendente, que agenda o build na janela. */
async function markPublished(
  tx: Executor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<void> {
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
  await recordPendingChange(tx, siteId, 'content', String(contentId));
}

/**
 * Publica a versão aprovada: confere a vaga do dia de São Paulo de `now`
 * (`reservePublicationSlot`), leva a versão a `publicado`, grava a linha em `publications` e
 * registra a mudança pendente, que agenda o build na janela do site.
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

  const slot = await reservePublicationSlot(tx, siteId, contentId, version, {
    at: now,
    today: true,
  });
  if (!slot.ok) return slot;

  const [publication] = await tx
    .insert(publications)
    .values({ siteId, contentId, version, publishedBy: actor.email, publishedAt: now })
    .returning({ id: publications.id });
  if (publication === undefined) throw new Error('INSERT em publications não devolveu o id');
  await markPublished(tx, siteId, contentId, version);
  return { ok: true, value: { publicationId: publication.id } };
}

/**
 * Publica a versão agendada, no job do horário marcado: sem conferir o limite (a vaga já foi
 * reservada no agendamento) e sem outra linha em `publications`. Trava o conteúdo, como o
 * cancelamento; se a versão não está mais `agendado` (cancelada antes), não faz nada.
 */
export async function publishScheduledVersion(
  tx: Executor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<'published' | 'not_scheduled'> {
  await tx
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)))
    .for('update');
  const [row] = await tx
    .select({ status: contentVersions.status })
    .from(contentVersions)
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, version),
      ),
    );
  if (row?.status !== 'agendado') return 'not_scheduled';
  await markPublished(tx, siteId, contentId, version);
  return 'published';
}
