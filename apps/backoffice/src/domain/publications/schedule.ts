import type { Result } from '@orakel/content-model';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { contents, contentVersions, publications } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { reservePublicationSlot } from './publish.ts';

/** Task do backoffice-worker que publica a versão agendada no horário marcado. */
export const PUBLISH_SCHEDULED_TASK = 'publish-scheduled';

export type PublishScheduledPayload = { siteId: string; contentId: number; version: number };

/** Um agendamento por conteúdo: a chave do job, para o cancelamento removê-lo. */
export const publishJobKey = (siteId: string, contentId: number): string =>
  `publish:${siteId}:${contentId}`;

const refused = (code: string, message: string): Result<never> => ({
  ok: false,
  issues: [{ code, message, path: [] }],
});

/**
 * Agenda a publicação da versão aprovada para `at` (workspace#20, R3). Muda só o status, para
 * `agendado`, sem mudança pendente (ADR 0015): o snapshot só muda quando o job publicar. A
 * vaga do limite diário é reservada agora, no dia de São Paulo de `at`: a linha de
 * `publications` nasce com `published_at` e `scheduled_for` iguais ao horário marcado, e
 * entra na contagem daquele dia; o job nunca recusa por limite.
 */
export async function schedulePublication(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  at: Date,
  options: { now?: Date } = {},
): Promise<Result<{ publicationId: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;
  const now = options.now ?? new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
    return refused(
      'publication.schedule_not_future',
      'O horário do agendamento precisa estar no futuro',
    );
  }

  const slot = await reservePublicationSlot(tx, siteId, contentId, version, {
    at,
    today: false,
  });
  if (!slot.ok) return slot;

  await tx
    .update(contentVersions)
    .set({ status: 'agendado' })
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, version),
      ),
    );
  const [publication] = await tx
    .insert(publications)
    .values({
      siteId,
      contentId,
      version,
      publishedBy: actor.email,
      publishedAt: at,
      scheduledFor: at,
    })
    .returning({ id: publications.id });
  if (publication === undefined) throw new Error('INSERT em publications não devolveu o id');
  const payload: PublishScheduledPayload = { siteId, contentId, version };
  await tx.execute(sql`
    select graphile_worker.add_job(
      identifier => ${PUBLISH_SCHEDULED_TASK},
      payload => ${JSON.stringify(payload)}::json,
      run_at => ${at.toISOString()}::timestamptz,
      max_attempts => 5,
      job_key => ${publishJobKey(siteId, contentId)},
      job_key_mode => 'replace'
    )`);
  return { ok: true, value: { publicationId: publication.id } };
}

/**
 * Cancela o agendamento: a versão volta a `aprovado`, a linha da reserva sai de
 * `publications` (libera a vaga do dia) e o job sai da fila. Trava o conteúdo, como o job,
 * para não correr com a publicação no horário.
 */
export async function cancelScheduledPublication(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const [content] = await tx
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
  if (content === undefined || row === undefined) {
    return refused(
      'content.not_found',
      `Versão ${version} do conteúdo ${contentId} não encontrada no site ${siteId}`,
    );
  }
  if (row.status !== 'agendado') {
    return refused(
      'publication.not_scheduled',
      `Só uma versão agendada tem agendamento a cancelar: a versão ${version} está ${row.status}`,
    );
  }

  const versionMatch = and(
    eq(contentVersions.siteId, siteId),
    eq(contentVersions.contentId, contentId),
    eq(contentVersions.version, version),
  );
  await tx.update(contentVersions).set({ status: 'aprovado' }).where(versionMatch);
  await tx
    .delete(publications)
    .where(
      and(
        eq(publications.siteId, siteId),
        eq(publications.contentId, contentId),
        eq(publications.version, version),
        isNotNull(publications.scheduledFor),
      ),
    );
  await tx.execute(sql`select graphile_worker.remove_job(${publishJobKey(siteId, contentId)})`);
  return { ok: true, value: undefined };
}

/**
 * Horário marcado da versão agendada (a reserva em `publications`), para a tela do conteúdo
 * mostrá-lo junto de "Cancelar agendamento" (#492). `null` quando a versão não está `agendado`.
 */
export async function scheduledPublicationAt(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<Result<Date | null>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const [row] = await db
    .select({ scheduledFor: publications.scheduledFor })
    .from(publications)
    .innerJoin(
      contentVersions,
      and(
        eq(contentVersions.siteId, publications.siteId),
        eq(contentVersions.contentId, publications.contentId),
        eq(contentVersions.version, publications.version),
      ),
    )
    .where(
      and(
        eq(publications.siteId, siteId),
        eq(publications.contentId, contentId),
        eq(publications.version, version),
        eq(contentVersions.status, 'agendado'),
        isNotNull(publications.scheduledFor),
      ),
    );
  return { ok: true, value: row?.scheduledFor ?? null };
}
