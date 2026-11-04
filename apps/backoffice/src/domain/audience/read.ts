// Leitura da audiência do site para o Backoffice (#548): só das tabelas diárias consolidadas
// (#546), nunca do Analytics Engine. O período são os últimos 7 ou 30 dias de
// America/Sao_Paulo terminando hoje, inclusive. Sessões do período = soma das sessões
// diárias (a sessão que cruza a meia-noite conta nos dois dias), coerente com a tabela.
import type { Result } from '@orakel/content-model';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { audienceDailySite } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { AUDIENCE_TIME_ZONE, type DayWindow } from './aggregate.ts';

/** Períodos da tela, em dias. */
export const AUDIENCE_PERIODS = [7, 30] as const;

export type AudiencePeriod = (typeof AUDIENCE_PERIODS)[number];

export const DEFAULT_AUDIENCE_PERIOD: AudiencePeriod = 7;

/** `?periodo=` da URL: `30` dá 30; ausente, inválido ou outro valor, 7. */
export function parseAudiencePeriod(value: unknown): AudiencePeriod {
  return AUDIENCE_PERIODS.find((period) => String(period) === value) ?? DEFAULT_AUDIENCE_PERIOD;
}

const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: AUDIENCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Os `period` dias de São Paulo que terminam no dia de `now`, inclusive nas duas pontas. */
export function audiencePeriodWindow(period: AudiencePeriod, now: Date): DayWindow {
  const to = localDay.format(now);
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (period - 1));
  return { from: from.toISOString().slice(0, 10), to };
}

export type AudienceDay = { day: string; views: number; sessions: number };

export type SiteAudience = {
  period: AudiencePeriod;
  window: DayWindow;
  totals: { views: number; sessions: number };
  /** Só os dias com linha consolidada, do mais recente para o mais antigo. */
  days: AudienceDay[];
};

/** Totais e linhas diárias do site no período; exige `site.read`. */
export async function readSiteAudience(
  db: Executor,
  actor: Actor,
  siteId: string,
  { period, now = new Date() }: { period: AudiencePeriod; now?: Date },
): Promise<Result<SiteAudience>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const window = audiencePeriodWindow(period, now);
  const days = await db
    .select({
      day: audienceDailySite.day,
      views: audienceDailySite.views,
      sessions: audienceDailySite.sessions,
    })
    .from(audienceDailySite)
    .where(
      and(
        eq(audienceDailySite.siteId, siteId),
        gte(audienceDailySite.day, window.from),
        lte(audienceDailySite.day, window.to),
      ),
    )
    .orderBy(desc(audienceDailySite.day));
  const totals = days.reduce(
    (sum, row) => ({ views: sum.views + row.views, sessions: sum.sessions + row.sessions }),
    { views: 0, sessions: 0 },
  );
  return { ok: true, value: { period, window, totals, days } };
}
