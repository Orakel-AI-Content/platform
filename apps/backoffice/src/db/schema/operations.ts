import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  unique,
  uniqueIndex,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { sites } from './sites.ts';

/**
 * Mudança pendente: toda gravação num dado que a API de exportação entrega a um site cria
 * uma, na mesma transação. O build baixa pela lista de IDs visíveis no snapshot.
 */
export const pendingChanges = pgTable('pending_changes', {
  id: serial().primaryKey(),
  siteId: text()
    .notNull()
    .references(() => sites.id),
  origin: text().notNull(),
  reference: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Preenchido quando um build bem-sucedido inclui a mudança. */
  resolvedAt: timestamp({ withTimezone: true }),
});

/** Tipo da execução: o build do site ou a reversão para uma versão já publicada. */
export const BUILD_KINDS = ['build', 'rollback'] as const;
export type BuildKind = (typeof BUILD_KINDS)[number];
/**
 * Estados da execução. `na_fila` e `rodando` são linhas abertas (sem `finishedAt`); `ok`,
 * `failed` e `cancelado` são fechadas. `ok` e `failed` são os valores gravados desde a L3.
 */
export const BUILD_STATUSES = ['na_fila', 'rodando', 'ok', 'failed', 'cancelado'] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];
/** Estados de linha aberta: a execução ainda não terminou. */
export const OPEN_BUILD_STATUSES = ['na_fila', 'rodando'] as const satisfies readonly BuildStatus[];
/** Estados em que uma execução termina de rodar: os que as consultas de build fechado leem. */
export const FINISHED_BUILD_STATUSES = ['ok', 'failed'] as const satisfies readonly BuildStatus[];
export const BUILD_STAGES = ['image', 'render', 'publish'] as const;
export const FAILURE_KINDS = ['permanent', 'transient'] as const;

/**
 * Uma execução da task `build` (12.0, L3): cada tentativa vira uma linha, gravada `na_fila` ao
 * enfileirar, promovida a `rodando` ao começar e fechada com o resultado. A de sucesso mais recente é a versão ativa do site —
 * referência da trava de segurança e do rollback (L4).
 */
export const builds = pgTable(
  'builds',
  {
    id: serial().primaryKey(),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    /**
     * Versão do site-builder usada (X.Y.Z, a tag da imagem site-builder). Nula enquanto a linha
     * está `na_fila`: a tag padrão só existe no build-runner, e a release é a que o plano usa.
     */
    release: text(),
    kind: text({ enum: BUILD_KINDS }).notNull().default('build'),
    /** Job do Graphile Worker e tentativa (1 a 5). */
    jobId: text(),
    attempt: integer().notNull(),
    status: text({ enum: BUILD_STATUSES }).notNull(),
    /** Etapa em andamento, enquanto a linha está `rodando`. */
    currentStage: text({ enum: BUILD_STAGES }),
    /** Quem pediu a execução: e-mail de quem clicou ou `system`. */
    requestedBy: text(),
    /** Horário previsto para começar, enquanto a linha está `na_fila`. */
    scheduledFor: timestamp({ withTimezone: true }),
    /** Etapa em que falhou. */
    failedStage: text({ enum: BUILD_STAGES }),
    failureKind: text({ enum: FAILURE_KINDS }),
    failureMessage: text(),
    /** Mudanças pendentes incluídas (as que o snapshot viu). */
    pendingChangeIds: integer().array().notNull().default([]),
    pages: integer(),
    files: integer(),
    /** Versão publicada no alvo (Worker na Cloudflare ou edge-local). */
    versionId: text(),
    /** Objeto do bucket build-cache com a saída compactada. */
    cacheKey: text(),
    renderMs: integer(),
    publishMs: integer(),
    /** Trecho final do log do container, quando a execução falha. */
    logTail: text(),
    /** Nulo enquanto a linha está `na_fila`. */
    startedAt: timestamp({ withTimezone: true }),
    /** Nulo enquanto a linha está aberta (`builds_finished_check`). */
    finishedAt: timestamp({ withTimezone: true }),
    /**
     * Pedido de cancelamento ("Cancelar"): e-mail de quem pediu e quando. Na fila, a linha
     * fecha `cancelado` na hora; rodando, continua `rodando` até o build-runner agir. Nulos no
     * cancelamento do sistema (job ignorado por site pausado).
     */
    cancelRequestedBy: text(),
    cancelRequestedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.siteId, t.finishedAt),
    /** Uma linha `na_fila` por job: o agendamento atualiza a do job em vez de criar outra. */
    uniqueIndex('builds_queued_job_unique')
      .on(t.jobId)
      .where(sql`${t.status} = 'na_fila'`),
    check(
      'builds_finished_check',
      sql`(${t.status} in ('na_fila', 'rodando')) = (${t.finishedAt} is null)`,
    ),
  ],
);

export const SITE_EVENT_KINDS = ['pausa', 'retomada', 'troca_de_versao'] as const;
export type SiteEventKind = (typeof SITE_EVENT_KINDS)[number];

/**
 * Mudanças de estado do site que só sobrescrevem colunas de `sites` (pausa, retomada, troca
 * de versão do site-builder), só de inserção, gravadas na mesma transação da mudança. `builds`
 * guarda as execuções; o histórico do site une as duas.
 */
export const siteEvents = pgTable(
  'site_events',
  {
    id: serial().primaryKey(),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    kind: text({ enum: SITE_EVENT_KINDS }).notNull(),
    /** E-mail de quem pediu, ou `system` na pausa automática por falha permanente. */
    requestedBy: text().notNull(),
    /** Pausa: motivo e culpado. */
    reason: text(),
    culpritOrigin: text(),
    culpritReference: text(),
    /** Troca de versão: release anterior (nula se não havia) e nova. */
    previousRelease: text(),
    release: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.siteId, t.createdAt)],
);

/**
 * Estados da criação da infraestrutura do site. `planejando`, `aguardando_confirmacao` e
 * `aplicando` são linhas abertas (sem `finishedAt`); `ok`, `falhou` e `cancelado` são fechadas.
 * `cancelado` é só de lote (workspace#98): a execução que não chegou a aplicar porque um site
 * anterior do lote falhou.
 */
export const INFRA_RUN_STATUSES = [
  'planejando',
  'aguardando_confirmacao',
  'aplicando',
  'ok',
  'falhou',
  'cancelado',
] as const;
export type InfraRunStatus = (typeof INFRA_RUN_STATUSES)[number];
export const OPEN_INFRA_RUN_STATUSES = [
  'planejando',
  'aguardando_confirmacao',
  'aplicando',
] as const satisfies readonly InfraRunStatus[];
/**
 * Etapas dos recursos do módulo OpenTofu `site`, na ordem e nos termos de quem opera: as do plano,
 * do resumo e do apply (drivers).
 */
export const INFRA_RESOURCE_STEPS = ['endereco', 'dns', 'email', 'regras', 'imagens'] as const;
export type InfraResourceStep = (typeof INFRA_RESOURCE_STEPS)[number];
/**
 * Etapas de uma execução: as do módulo e, só na remoção e antes delas, `paginas` (apagar o
 * Worker do site, fora do OpenTofu).
 */
export const INFRA_STEPS = ['paginas', ...INFRA_RESOURCE_STEPS] as const;
export type InfraStep = (typeof INFRA_STEPS)[number];
/**
 * O que a execução faz com a infraestrutura do site: criar, remover (workspace#97) ou reaplicar a
 * descrição atual sobre a infra já aplicada (workspace#98).
 */
export const INFRA_RUN_KINDS = ['criar', 'remover', 'reaplicar'] as const;
export type InfraRunKind = (typeof INFRA_RUN_KINDS)[number];

/**
 * Estados do lote de reaplicação: `planejando` até todos os planos chegarem,
 * `aguardando_confirmacao` à espera da confirmação única e `aplicando` um site por vez são
 * abertos (sem `finishedAt`); `concluido` (todos `ok`) e `interrompido` (um site falhou) são
 * fechados.
 */
export const INFRA_BATCH_STATES = [
  'planejando',
  'aguardando_confirmacao',
  'aplicando',
  'concluido',
  'interrompido',
] as const;
export type InfraBatchState = (typeof INFRA_BATCH_STATES)[number];
export const OPEN_INFRA_BATCH_STATES = [
  'planejando',
  'aguardando_confirmacao',
  'aplicando',
] as const satisfies readonly InfraBatchState[];

/**
 * "Reaplicar em todos os desatualizados" (workspace#98): uma execução `reaplicar` por site em
 * `infra_runs` (`batchId` e `batchPosition`), todos os planos antes, uma confirmação para todas e
 * o apply de um site por vez, parando na primeira falha. O estado de cada site é o da própria
 * execução. Só um lote aberto por vez (índice único parcial).
 */
export const infraBatches = pgTable(
  'infra_batches',
  {
    id: serial().primaryKey(),
    state: text({ enum: INFRA_BATCH_STATES }).notNull().default('planejando'),
    /** E-mail de quem pediu. */
    requestedBy: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Nulo enquanto o lote está aberto (`infra_batches_finished_check`). */
    finishedAt: timestamp({ withTimezone: true }),
  },
  () => [
    uniqueIndex('infra_batches_open_unique')
      .on(sql`(true)`)
      .where(sql`state in ('planejando', 'aguardando_confirmacao', 'aplicando')`),
    check(
      'infra_batches_finished_check',
      sql`(state in ('planejando', 'aguardando_confirmacao', 'aplicando')) = (finished_at is null)`,
    ),
  ],
);

/**
 * Uma criação (ou remoção ou reaplicação, pelo `tipo`) da infraestrutura do site (OpenTofu, ADR 0027): nasce `planejando` no pedido,
 * recebe o resumo do plano e espera a confirmação, aplica etapa por etapa e fecha `ok` (com os
 * nameservers da zona) ou `falhou` (com a etapa e o motivo). "Tentar de novo" é uma linha nova.
 * Uma linha aberta por site, garantida pelo índice único parcial. Não é um build: o histórico
 * do site une esta tabela a `builds` e `site_events`.
 */
export const infraRuns = pgTable(
  'infra_runs',
  {
    id: serial().primaryKey(),
    siteId: text()
      .notNull()
      .references(() => sites.id),
    /** Criação, remoção ou reaplicação; as linhas anteriores à remoção são criações. */
    tipo: text({ enum: INFRA_RUN_KINDS }).notNull().default('criar'),
    status: text({ enum: INFRA_RUN_STATUSES }).notNull(),
    /** Etapa em andamento, enquanto `aplicando`. */
    currentStep: text({ enum: INFRA_STEPS }),
    /** Resumo do plano que a confirmação aplica; o formato é do infra-runner. */
    planSummary: text(),
    /** E-mail de quem pediu. */
    requestedBy: text().notNull(),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** E-mail de quem confirmou o plano; o lifecycle avança em nome dele. */
    confirmedBy: text(),
    confirmedAt: timestamp({ withTimezone: true }),
    /** Nameservers da zona, no `ok`. */
    nameservers: text().array(),
    /** Etapa em que falhou (nula se falhou no plano) e o motivo. */
    failedStep: text({ enum: INFRA_STEPS }),
    failureMessage: text(),
    /** Nulo enquanto a linha está aberta (`infra_runs_finished_check`). */
    finishedAt: timestamp({ withTimezone: true }),
    /** Lote de reaplicação da execução, e a posição dela (de 0); nulos fora de lote. */
    batchId: integer().references(() => infraBatches.id),
    batchPosition: integer(),
  },
  (t) => [
    index().on(t.siteId, t.finishedAt),
    unique('infra_runs_batch_position_unique').on(t.batchId, t.batchPosition),
    check('infra_runs_batch_check', sql`(${t.batchId} is null) = (${t.batchPosition} is null)`),
    uniqueIndex('infra_runs_open_site_unique')
      .on(t.siteId)
      .where(sql`${t.status} in ('planejando', 'aguardando_confirmacao', 'aplicando')`),
    check(
      'infra_runs_finished_check',
      sql`(${t.status} in ('planejando', 'aguardando_confirmacao', 'aplicando')) = (${t.finishedAt} is null)`,
    ),
  ],
);

export const ROLES = ['admin', 'editor', 'revisor', 'operacao'] as const;
export type Role = (typeof ROLES)[number];

/** Pessoas do Backoffice, identificadas pelo e-mail do JWT do Access. */
export const users = pgTable('users', {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: integer()
      .notNull()
      .references(() => users.id),
    role: text({ enum: ROLES }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);
