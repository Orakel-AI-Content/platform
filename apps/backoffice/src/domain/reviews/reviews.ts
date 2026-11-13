import type { Issue, Result } from '@orakel/content-model';
import type { Resources } from '@orakel/content-model/v1';
import { and, asc, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import {
  authors,
  type ContentData,
  contentVersions,
  generationRuns,
  redirects,
  reviews,
  taxonomies,
} from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { enqueueCorrection } from '../generation/runs.ts';
import {
  nextPublicationSlot,
  PUBLISH_SLOT_HORIZON_DAYS,
  publishVersion,
} from '../publications/publish.ts';
import { schedulePublication } from '../publications/schedule.ts';
import {
  listLiveContents,
  listReviewQueue,
  type ReviewQueueItem,
  validateContentData,
} from '../content/contents.ts';
import { currentConfig, resourcesFor } from '../sites/sites.ts';
import {
  confirmedKeys,
  latestVersion,
  lockVersionInReview,
  notFound,
  refused,
  REVIEW_CHECKLIST,
} from './version-guard.ts';
import {
  checkContextFor,
  computeReviewChecks,
  type ReviewCheck,
  type SiteCheckContext,
} from './checks.ts';
import { linkCheckFor, type LinkCheckState } from './link-checks.ts';
import { opinionFor, opinionOutlook, type OpinionOutlook } from './opinions.ts';
import { compareVersions, type VersionChanges } from './changes.ts';
import { setAllConfirmations } from './confirmations.ts';

export {
  confirmedKeys,
  lockVersionInReview,
  refused,
  REVIEW_CHECKLIST,
  type ReviewChecklistKey,
} from './version-guard.ts';

/** Problemas de validação da versão, contra os recursos da release do site (vazio: sem erro). */
async function validationIssues(
  db: Executor,
  siteId: string,
  contentId: number,
  data: Parameters<typeof validateContentData>[3],
  resources?: Resources,
): Promise<Issue[]> {
  const validated = await validateContentData(
    db,
    siteId,
    contentId,
    data,
    resources ?? (await resourcesFor(db, siteId)),
  );
  return validated.ok ? [] : validated.issues;
}

/**
 * Validação da versão mais recente para a tela de revisão: as issues voltam como dado, não
 * como recusa. Quem edita também lê (`site.read`); aprovar exige `content.publish`.
 */
export async function reviewIssues(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<{ version: number; issues: Issue[] }>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const latest = await latestVersion(db, siteId, contentId);
  if (latest === undefined) return { ok: false, issues: [notFound(siteId, contentId)] };
  return {
    ok: true,
    value: {
      version: latest.version,
      issues: await validationIssues(db, siteId, contentId, latest.data),
    },
  };
}

/**
 * Contexto do site inteiro para as checagens, lido uma vez (#772): conteúdos no ar,
 * taxonomias, autores, redirects, configuração, títulos e os recursos da release. Cada
 * conteúdo deriva o seu com `checkContextFor`.
 */
async function siteCheckContext(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<{ site: SiteCheckContext; resources: Resources }>> {
  const live = await listLiveContents(db, actor, siteId);
  if (!live.ok) return live;
  // Em sequência: no lote (#775), `db` é a conexão única da transação, sem consulta paralela.
  const taxonomyRows = await db
    .select({ id: taxonomies.id, kind: taxonomies.kind, slug: taxonomies.slug })
    .from(taxonomies)
    .where(eq(taxonomies.siteId, siteId));
  const authorRows = await db
    .select({ slug: authors.slug })
    .from(authors)
    .where(eq(authors.siteId, siteId));
  const redirectRows = await db
    .select({ from: redirects.from })
    .from(redirects)
    .where(eq(redirects.siteId, siteId));
  const config = await currentConfig(db, siteId);
  // Versão mais recente de cada conteúdo do site, em qualquer status.
  const titleRows = await db
    .selectDistinctOn([contentVersions.contentId], {
      contentId: contentVersions.contentId,
      title: sql<string>`${contentVersions.data}->>'title'`,
    })
    .from(contentVersions)
    .where(eq(contentVersions.siteId, siteId))
    .orderBy(asc(contentVersions.contentId), desc(contentVersions.version));
  const resources = await resourcesFor(db, siteId);
  return {
    ok: true,
    value: {
      site: {
        live: live.value,
        taxonomies: taxonomyRows,
        authorSlugs: authorRows.map((row) => row.slug),
        config,
        redirectFroms: redirectRows.map((row) => row.from),
        titles: titleRows,
      },
      resources,
    },
  };
}

/**
 * Checagens automáticas da versão mais recente para a tela de revisão (`checks.ts`):
 * calculadas a cada leitura, nunca gravadas. Só os problemas da validação são `erro`, e
 * continuam sendo o que barra `approveVersion`; o resto é `aviso`. Exige `site.read`.
 */
export async function reviewChecks(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<{ version: number; checks: ReviewCheck[] }>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const latest = await latestVersion(db, siteId, contentId);
  if (latest === undefined) return { ok: false, issues: [notFound(siteId, contentId)] };
  const context = await siteCheckContext(db, actor, siteId);
  if (!context.ok) return context;
  const { site, resources } = context.value;
  const issues = await validationIssues(db, siteId, contentId, latest.data, resources);
  return {
    ok: true,
    value: {
      version: latest.version,
      checks: computeReviewChecks(latest.data, issues, checkContextFor(site, contentId)),
    },
  };
}

/** Item da fila de revisão com o que o revisor precisa ver antes de abrir o conteúdo (#772). */
export type ReviewQueueEntry = ReviewQueueItem & {
  /**
   * Itens da revisão que não estão `ok`, contados como na tela de revisão: as checagens com
   * `aviso` ou `erro`, mais os links externos quando algum não respondeu.
   */
  pending: number;
  /** Checagem de links externos da versão, à parte da contagem: diz se ela já terminou. */
  links: LinkCheckState;
  /** A revisão mais recente do conteúdo devolveu uma versão até a da fila: voltou da devolução. */
  returned: boolean;
  /** A versão da fila foi criada pela correção automática (`correctionRuns`). */
  autoCorrected: boolean;
  /**
   * Resultado do parecer automático da versão (#774), reduzido do mesmo `opinionFor` da tela de
   * revisão. Só informa: não entra em `pending`.
   */
  opinion: OpinionOutlook;
};

/**
 * Execução `correcao` `ok` que criou a versão (ADR 0023), derivada na leitura e nunca gravada:
 * a rota interna só grava sobre a devolução pendente, então a versão corrigida é sempre a
 * seguinte à base (`baseVersion + 1`). Uma correção em `falha` não cria versão.
 */
function correctionRuns(siteId: string, contentIds: readonly number[]) {
  return and(
    eq(generationRuns.siteId, siteId),
    eq(generationRuns.kind, 'correcao'),
    eq(generationRuns.status, 'ok'),
    inArray(generationRuns.contentId, [...contentIds]),
  );
}

const correctionKey = (contentId: number, version: number): string =>
  `${String(contentId)}:${String(version)}`;

function pendingCount(checks: readonly ReviewCheck[], links: LinkCheckState): number {
  const failedLinks = links.state === 'verificado' && links.links.some((link) => !link.ok);
  return checks.filter((check) => check.level !== 'ok').length + (failedLinks ? 1 : 0);
}

/**
 * Fila de revisão (`listReviewQueue`) com pendências, links, devolução e parecer de cada item,
 * calculados na leitura e nunca gravados. O contexto do site e os recursos da release são lidos
 * uma vez para a fila inteira; cada item deriva o seu com `checkContextFor`. Exige `site.read`.
 */
export async function reviewQueue(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<ReviewQueueEntry[]>> {
  const queue = await listReviewQueue(db, actor, siteId);
  if (!queue.ok) return queue;
  if (queue.value.length === 0) return { ok: true, value: [] };
  const context = await siteCheckContext(db, actor, siteId);
  if (!context.ok) return context;
  const { site, resources } = context.value;

  const ids = queue.value.map((item) => item.id);
  const [dataRows, lastReviews, corrections] = await Promise.all([
    db
      .select({ contentId: contentVersions.contentId, data: contentVersions.data })
      .from(contentVersions)
      .where(
        and(
          eq(contentVersions.siteId, siteId),
          or(
            ...queue.value.map((item) =>
              and(
                eq(contentVersions.contentId, item.id),
                eq(contentVersions.version, item.version),
              ),
            ),
          ),
        ),
      ),
    db
      .selectDistinctOn([reviews.contentId], {
        contentId: reviews.contentId,
        version: reviews.version,
        decision: reviews.decision,
      })
      .from(reviews)
      .where(and(eq(reviews.siteId, siteId), inArray(reviews.contentId, ids)))
      .orderBy(asc(reviews.contentId), desc(reviews.id)),
    db
      .select({ contentId: generationRuns.contentId, baseVersion: generationRuns.baseVersion })
      .from(generationRuns)
      .where(correctionRuns(siteId, ids)),
  ]);
  const dataOf = new Map(dataRows.map((row) => [row.contentId, row.data]));
  const lastReviewOf = new Map(lastReviews.map((row) => [row.contentId, row]));
  // O CHECK `generation_runs_correcao_check` garante conteúdo e versão-base na `correcao`.
  const corrected = new Set(
    corrections.map((row) => correctionKey(row.contentId!, row.baseVersion! + 1)),
  );

  const entries: ReviewQueueEntry[] = [];
  for (const item of queue.value) {
    const data = dataOf.get(item.id);
    // A versão listada existe: versões não são apagadas.
    if (data === undefined)
      throw new Error(`versão ${String(item.version)} de ${String(item.id)} sumiu`);
    const target = { siteId, contentId: item.id, version: item.version };
    const standing = await reviewStanding(db, actor, target, data, { site, resources });
    if (!standing.ok) return standing;
    const last = lastReviewOf.get(item.id);
    entries.push({
      ...item,
      ...standing.value,
      returned: last?.decision === 'devolvido' && last.version <= item.version,
      autoCorrected: corrected.has(correctionKey(item.id, item.version)),
    });
  }
  return { ok: true, value: entries };
}

/** O que a fila mostra de uma versão em revisão e o lote exige limpo: pendências, links, parecer. */
type ReviewStanding = Pick<ReviewQueueEntry, 'pending' | 'links' | 'opinion'>;

/**
 * Pendências, links e parecer da versão `target`, com os dados `data`, sobre o contexto do site
 * lido uma vez (`siteCheckContext`): o mesmo cálculo para a fila (#772, #774) e o lote (#775).
 */
async function reviewStanding(
  db: Executor,
  actor: Actor,
  target: { siteId: string; contentId: number; version: number },
  data: ContentData,
  context: { site: SiteCheckContext; resources: Resources },
): Promise<Result<ReviewStanding>> {
  const { siteId, contentId } = target;
  const issues = await validationIssues(db, siteId, contentId, data, context.resources);
  const checks = computeReviewChecks(data, issues, checkContextFor(context.site, contentId));
  // Em sequência: no lote, `db` é a conexão única da transação, que não aceita consulta paralela.
  const links = await linkCheckFor(db, actor, target);
  if (!links.ok) return links;
  const opinion = await opinionFor(db, actor, target);
  if (!opinion.ok) return opinion;
  return {
    ok: true,
    value: {
      pending: pendingCount(checks, links.value),
      links: links.value,
      opinion: opinionOutlook(opinion.value),
    },
  };
}

/** Muda só o status da versão (ADR 0015): sem mudança pendente, o snapshot não o carrega. */
async function setVersionStatus(
  tx: Executor,
  siteId: string,
  contentId: number,
  version: number,
  status: 'aprovado' | 'rascunho',
): Promise<void> {
  await tx
    .update(contentVersions)
    .set({ status })
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.version, version),
      ),
    );
}

/**
 * Aprova a versão que o revisor viu: precisa ser a mais recente, estar `em_revisao`, ter as
 * confirmações do checklist gravadas na versão (`confirmations.ts`, #749) e passar na validação
 * da release do site. Grava a revisão, com as chaves confirmadas, e leva a versão a `aprovado`,
 * sem mudança pendente (o status não entra no snapshot, ADR 0015).
 */
export async function approveVersion(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
): Promise<Result<{ reviewId: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const locked = await lockVersionInReview(tx, siteId, contentId, version, 'aprovada');
  if (!locked.ok) return locked;
  const latest = locked.value;

  const confirmed: readonly string[] = await confirmedKeys(tx, siteId, contentId, version);
  const missing = REVIEW_CHECKLIST.filter((item) => !confirmed.includes(item.key));
  if (missing.length > 0) {
    return refused(
      'review.checklist_incomplete',
      `Marque todos os itens do checklist: falta ${missing.map((item) => item.label).join('; ')}`,
      ['checklist'],
    );
  }

  const issues = await validationIssues(tx, siteId, contentId, latest.data);
  if (issues.length > 0) return { ok: false, issues };

  const [review] = await tx
    .insert(reviews)
    .values({ siteId, contentId, version, reviewer: actor.email, checklist: [...confirmed] })
    .returning({ id: reviews.id });
  if (review === undefined) throw new Error('INSERT em reviews não devolveu o id');
  await setVersionStatus(tx, siteId, contentId, version, 'aprovado');
  return { ok: true, value: { reviewId: review.id } };
}

/**
 * Desfecho da decisão do revisor (workspace#89): no ar agora ou agendado em `at`. `overflowed`
 * diz que o dia pedido estava cheio e a publicação foi para a próxima vaga.
 */
export type ApprovalOutcome = {
  reviewId: number;
  publicationId: number;
  outcome: 'published' | 'scheduled';
  at: Date;
  overflowed: boolean;
};

/** Interrompe o savepoint da decisão quando um passo é recusado: desfaz também a aprovação. */
class DecisionAborted extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super('Decisão do revisor interrompida');
    this.issues = issues;
  }
}

/**
 * Aprova e, num savepoint, executa `publish`: qualquer recusa desfaz tudo, inclusive a
 * aprovação, e volta como `Result`. O chamador confirma a transação mesmo com `ok: false`.
 */
async function approveThen(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  publish: (savepoint: Executor) => Promise<Result<Omit<ApprovalOutcome, 'reviewId'>>>,
): Promise<Result<ApprovalOutcome>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;
  try {
    return await tx.transaction(async (savepoint) => {
      const approved = await approveVersion(savepoint, actor, siteId, contentId, version);
      if (!approved.ok) throw new DecisionAborted(approved.issues);
      const published = await publish(savepoint);
      if (!published.ok) throw new DecisionAborted(published.issues);
      return {
        ok: true as const,
        value: { reviewId: approved.value.reviewId, ...published.value },
      };
    });
  } catch (error) {
    if (error instanceof DecisionAborted) return { ok: false, issues: error.issues };
    throw error;
  }
}

const isDailyLimit = (result: Result<unknown>): boolean =>
  !result.ok && result.issues.some((issue) => issue.code === 'publication.daily_limit');

/**
 * Transbordo do limite diário: agenda na próxima vaga (`nextPublicationSlot`), no mesmo
 * horário de `from`. Sem vaga no horizonte (inclusive com o limite `0`), `publication.no_slot`.
 */
async function scheduleOnNextSlot(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  from: Date,
  now: Date,
): Promise<Result<Omit<ApprovalOutcome, 'reviewId'>>> {
  const at = await nextPublicationSlot(tx, siteId, from);
  if (at === undefined) {
    return refused(
      'publication.no_slot',
      `O site ${siteId} não tem vaga de publicação nos próximos ${PUBLISH_SLOT_HORIZON_DAYS} dias (dia de São Paulo)`,
    );
  }
  const scheduled = await schedulePublication(tx, actor, siteId, contentId, version, at, { now });
  if (!scheduled.ok) return scheduled;
  return {
    ok: true,
    value: {
      publicationId: scheduled.value.publicationId,
      outcome: 'scheduled',
      at,
      overflowed: true,
    },
  };
}

/**
 * Aprova e publica na hora, numa decisão só (workspace#89): `approveVersion` e depois
 * `publishVersion`, duas transições (ADRs 0015 e 0017). Com o limite do dia de São Paulo
 * atingido, agenda no primeiro dia seguinte com vaga, no mesmo horário de `now`. Qualquer
 * recusa desfaz tudo, inclusive a aprovação.
 */
export async function approveAndPublish(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  options: { now?: Date } = {},
): Promise<Result<ApprovalOutcome>> {
  const now = options.now ?? new Date();
  return approveThen(tx, actor, siteId, contentId, version, async (savepoint) => {
    const published = await publishVersion(savepoint, actor, siteId, contentId, version, { now });
    if (published.ok) {
      return {
        ok: true,
        value: {
          publicationId: published.value.publicationId,
          outcome: 'published',
          at: now,
          overflowed: false,
        },
      };
    }
    if (!isDailyLimit(published)) return published;
    return scheduleOnNextSlot(savepoint, actor, siteId, contentId, version, now, now);
  });
}

/**
 * Aprova e agenda para `at`, numa decisão só (workspace#89): `approveVersion` e depois
 * `schedulePublication`. Com o dia de São Paulo de `at` cheio, agenda no próximo dia com vaga,
 * no mesmo horário de `at`. Qualquer recusa desfaz tudo, inclusive a aprovação.
 */
export async function approveAndSchedule(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  at: Date,
  options: { now?: Date } = {},
): Promise<Result<ApprovalOutcome>> {
  const now = options.now ?? new Date();
  return approveThen(tx, actor, siteId, contentId, version, async (savepoint) => {
    const scheduled = await schedulePublication(savepoint, actor, siteId, contentId, version, at, {
      now,
    });
    if (scheduled.ok) {
      return {
        ok: true,
        value: {
          publicationId: scheduled.value.publicationId,
          outcome: 'scheduled',
          at,
          overflowed: false,
        },
      };
    }
    if (!isDailyLimit(scheduled)) return scheduled;
    return scheduleOnNextSlot(savepoint, actor, siteId, contentId, version, at, now);
  });
}

/** Artigo do lote: o conteúdo e a versão que o revisor viu no resumo. */
export type BatchItem = { contentId: number; version: number };

/**
 * Desfecho de um artigo do lote (#775): aprovado e no ar ou agendado, como em
 * `approveAndPublish`, ou `failed` com as issues, e nada gravado para ele.
 */
export type BatchOutcome = BatchItem & (ApprovalOutcome | { outcome: 'failed'; issues: Issue[] });

/** Interrompe o savepoint de um artigo do lote: desfaz só ele. */
class BatchItemAborted extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super('Artigo do lote interrompido');
    this.issues = issues;
  }
}

/** Estados da checagem de links que já terminaram. */
const LINK_CHECK_DONE: readonly LinkCheckState['state'][] = ['verificado', 'sem_links'];

/**
 * Motivos de a versão travada não entrar no lote, pelo que a fila mostra (vazio: elegível):
 * pendência, checagem de links não concluída ou parecer que não é favorável.
 */
function ineligibility(standing: ReviewStanding): string[] {
  const reasons: string[] = [];
  if (standing.pending > 0) reasons.push(`tem ${String(standing.pending)} pendência(s)`);
  if (!LINK_CHECK_DONE.includes(standing.links.state)) {
    reasons.push('a checagem de links externos não terminou');
  }
  if (standing.opinion !== 'favoravel') {
    reasons.push(`o parecer automático não é favorável (${standing.opinion})`);
  }
  return reasons;
}

const ineligible = (contentId: number, reasons: readonly string[]): Issue => ({
  code: 'review.batch_ineligible',
  message: `O conteúdo ${String(contentId)} não pode ser aprovado em lote: ${reasons.join('; ')}`,
  path: [],
});

/**
 * Aprova e publica em lote os artigos limpos da fila (#775, ADR 0024). Cada artigo roda no
 * próprio savepoint: trava a versão, confere a elegibilidade (em revisão, sem pendência, links
 * conferidos e parecer favorável), grava as três confirmações do checklist em nome do revisor
 * (a confirmação de leitura feita no resumo) e chama `approveAndPublish`, que agenda na próxima
 * vaga quando o limite diário enche. A recusa de um artigo desfaz só ele, e os outros seguem: o
 * desfecho volta por artigo, na ordem recebida, que é a que ocupa as vagas do dia.
 * O lote inteiro só é recusado sem `content.publish` ou vazio.
 */
export async function approveAndPublishBatch(
  tx: Executor,
  actor: Actor,
  siteId: string,
  items: readonly BatchItem[],
  options: { now?: Date } = {},
): Promise<Result<BatchOutcome[]>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;
  const unique = items.filter(
    (item, index) => items.findIndex((other) => other.contentId === item.contentId) === index,
  );
  if (unique.length === 0) {
    return refused('review.empty_batch', 'Escolha ao menos um conteúdo para aprovar', ['items']);
  }
  const now = options.now ?? new Date();
  const context = await siteCheckContext(tx, actor, siteId);
  if (!context.ok) return context;

  const outcomes: BatchOutcome[] = [];
  for (const item of unique) {
    const { contentId, version } = item;
    try {
      const approved = await tx.transaction(async (savepoint) => {
        const locked = await lockVersionInReview(savepoint, siteId, contentId, version, 'aprovada');
        if (!locked.ok) {
          const notInReview = locked.issues.find((issue) => issue.code === 'review.not_in_review');
          if (notInReview === undefined) throw new BatchItemAborted(locked.issues);
          throw new BatchItemAborted([ineligible(contentId, [notInReview.message])]);
        }
        const standing = await reviewStanding(
          savepoint,
          actor,
          { siteId, contentId, version },
          locked.value.data,
          context.value,
        );
        if (!standing.ok) throw new BatchItemAborted(standing.issues);
        const reasons = ineligibility(standing.value);
        if (reasons.length > 0) throw new BatchItemAborted([ineligible(contentId, reasons)]);

        const confirmed = await setAllConfirmations(
          savepoint,
          actor,
          siteId,
          contentId,
          version,
          true,
        );
        if (!confirmed.ok) throw new BatchItemAborted(confirmed.issues);
        const published = await approveAndPublish(savepoint, actor, siteId, contentId, version, {
          now,
        });
        if (!published.ok) throw new BatchItemAborted(published.issues);
        return published.value;
      });
      outcomes.push({ ...item, ...approved });
    } catch (error) {
      if (!(error instanceof BatchItemAborted)) throw error;
      outcomes.push({ ...item, outcome: 'failed', issues: error.issues });
    }
  }
  return { ok: true, value: outcomes };
}

/**
 * Devolve ao editor a versão que o revisor viu (#598, ADR 0020): a mesma guarda da aprovação,
 * com comentário obrigatório no lugar do checklist e sem validação da release (devolver não
 * leva nada ao site). Grava a revisão como `devolvido`, com o comentário, e leva a versão de
 * volta a `rascunho`: sai da fila e pode ser reenviada como está ou depois de editada.
 * Com `autoCorrect`, pede também a correção automática (ADR 0023), na mesma transação: a
 * execução `correcao` `pendente` e o job `correct-article`. A recusa não grava nada.
 */
export async function returnVersion(
  tx: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
  version: number,
  comment: string,
  options: { autoCorrect?: boolean } = {},
): Promise<Result<{ reviewId: number; runId?: number }>> {
  const allowed = requireRole(actor, 'content.publish');
  if (!allowed.ok) return allowed;

  const text = comment.trim();
  if (text === '') {
    return refused('review.comment_required', 'Escreva o que o editor precisa corrigir.', [
      'comment',
    ]);
  }

  const locked = await lockVersionInReview(tx, siteId, contentId, version, 'devolvida');
  if (!locked.ok) return locked;

  const [review] = await tx
    .insert(reviews)
    .values({
      siteId,
      contentId,
      version,
      reviewer: actor.email,
      checklist: [],
      decision: 'devolvido',
      comment: text,
    })
    .returning({ id: reviews.id });
  if (review === undefined) throw new Error('INSERT em reviews não devolveu o id');
  await setVersionStatus(tx, siteId, contentId, version, 'rascunho');
  if (options.autoCorrect !== true) return { ok: true, value: { reviewId: review.id } };
  const { runId } = await enqueueCorrection(tx, {
    siteId,
    contentId,
    baseVersion: version,
    reviewId: review.id,
    createdBy: actor.email,
  });
  return { ok: true, value: { reviewId: review.id, runId } };
}

/** Devolução que o editor ainda precisa atender: o que corrigir, quem devolveu e quando. */
export type PendingReturn = {
  version: number;
  reviewer: string;
  comment: string;
  returnedAt: Date;
};

/**
 * Devolução pendente do conteúdo (ADR 0020): a revisão mais recente, se for uma devolução e
 * nada tiver sido reenviado desde então, ou seja, a versão devolvida e todas as que vieram
 * depois continuam em `rascunho`. Continua à vista enquanto o editor salva a correção e some
 * no reenvio. `null` sem devolução pendente.
 */
export async function pendingReturn(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<Result<PendingReturn | null>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const [last] = await db
    .select({
      version: reviews.version,
      reviewer: reviews.reviewer,
      decision: reviews.decision,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.siteId, siteId), eq(reviews.contentId, contentId)))
    .orderBy(desc(reviews.id))
    .limit(1);
  if (last === undefined || last.decision !== 'devolvido' || last.comment === null) {
    return { ok: true, value: null };
  }
  const [resubmitted] = await db
    .select({ version: contentVersions.version })
    .from(contentVersions)
    .where(
      and(
        eq(contentVersions.siteId, siteId),
        eq(contentVersions.contentId, contentId),
        gte(contentVersions.version, last.version),
        ne(contentVersions.status, 'rascunho'),
      ),
    )
    .limit(1);
  if (resubmitted !== undefined) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      version: last.version,
      reviewer: last.reviewer,
      comment: last.comment,
      returnedAt: last.createdAt,
    },
  };
}

/** A devolução que pediu a correção automática da versão: o comentário do revisor. */
export type ReviewCorrection = { reviewer: string; comment: string };

/**
 * O que mudou desde a última revisão (#768): a versão atual comparada (`compareVersions`) com a
 * `base`, a versão da revisão mais recente do conteúdo, de qualquer decisão. Os dados da base
 * voltam junto, para a tela resolver nomes e mídias. Quando a versão atual veio da correção
 * automática (`correctionRuns`), `correction` traz o comentário da devolução que a pediu; senão,
 * `null`. `null` sem base: o conteúdo nunca foi revisado, ou a revisão mais recente é da própria
 * versão atual (devolvida e reenviada sem edição), o que já foi visto. Exige `site.read`.
 */
export async function reviewChanges(
  db: Executor,
  actor: Actor,
  siteId: string,
  contentId: number,
): Promise<
  Result<
    | (VersionChanges & {
        baseVersion: number;
        version: number;
        base: ContentData;
        correction: ReviewCorrection | null;
      })
    | null
  >
> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const latest = await latestVersion(db, siteId, contentId);
  if (latest === undefined) return { ok: false, issues: [notFound(siteId, contentId)] };
  const [last] = await db
    .select({ version: reviews.version, data: contentVersions.data })
    .from(reviews)
    .innerJoin(
      contentVersions,
      and(
        eq(contentVersions.siteId, reviews.siteId),
        eq(contentVersions.contentId, reviews.contentId),
        eq(contentVersions.version, reviews.version),
      ),
    )
    .where(and(eq(reviews.siteId, siteId), eq(reviews.contentId, contentId)))
    .orderBy(desc(reviews.id))
    .limit(1);
  if (last === undefined || last.version >= latest.version) return { ok: true, value: null };
  const [correction] = await db
    .select({ reviewer: reviews.reviewer, comment: reviews.comment })
    .from(generationRuns)
    .innerJoin(reviews, eq(reviews.id, generationRuns.reviewId))
    .where(
      and(correctionRuns(siteId, [contentId]), eq(generationRuns.baseVersion, latest.version - 1)),
    )
    .limit(1);
  return {
    ok: true,
    value: {
      ...compareVersions(last.data, latest.data),
      baseVersion: last.version,
      version: latest.version,
      base: last.data,
      // A devolução exige o comentário (ADR 0020).
      correction:
        correction === undefined
          ? null
          : { reviewer: correction.reviewer, comment: correction.comment ?? '' },
    },
  };
}
