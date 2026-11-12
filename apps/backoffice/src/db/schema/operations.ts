import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
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
