import {
  SiteConfigSchema,
  validateSiteConfig,
  RESOURCES,
  type Resources,
  type SiteConfig,
} from '@orakel/content-model/v1';
import type { Result } from '@orakel/content-model';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { pendingChanges, siteConfigs, sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import { lastBuilds, type LastBuild } from '../builds/builds.ts';
import { recordPendingChange } from '../pending-changes/record.ts';

export type SiteSummary = {
  id: string;
  name: string;
  domain: string;
  lifecycle: (typeof sites.$inferSelect)['lifecycle'];
  state: (typeof sites.$inferSelect)['state'];
  pausedReason: string | null;
  release: string | null;
  indexavel: boolean;
  pendingChanges: number;
  lastBuild: LastBuild | null;
};

/** Cadastra um site com a configuração v1, validada contra os recursos da release. */
export async function createSite(
  tx: Executor,
  actor: Actor,
  input: SiteConfig,
  resources: Resources = RESOURCES,
): Promise<Result<{ siteId: string }>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const parsed = SiteConfigSchema.safeParse(input);
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
  const semantic = validateSiteConfig(parsed.data, resources);
  if (!semantic.ok) return semantic;
  const config = semantic.value;

  const existing = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, config.siteId));
  if (existing.length > 0) {
    return {
      ok: false,
      issues: [
        { code: 'site.exists', message: `O site ${config.siteId} já existe`, path: ['siteId'] },
      ],
    };
  }

  await tx.insert(sites).values({ id: config.siteId, name: config.name });
  await tx.insert(siteConfigs).values({ siteId: config.siteId, version: 1, config });
  await recordPendingChange(tx, config.siteId, 'config', 'v1');
  return { ok: true, value: { siteId: config.siteId } };
}

export async function siteExists(db: Executor, siteId: string): Promise<boolean> {
  const rows = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  return rows.length > 0;
}

/** Configuração corrente (maior versão) de um site. */
export async function currentConfig(db: Executor, siteId: string): Promise<SiteConfig | undefined> {
  const [row] = await db
    .select({ config: siteConfigs.config })
    .from(siteConfigs)
    .where(eq(siteConfigs.siteId, siteId))
    .orderBy(desc(siteConfigs.version))
    .limit(1);
  return row?.config;
}

/** Registro de instâncias, na forma da tela de sites. */
export async function listSites(db: Executor, actor: Actor): Promise<Result<SiteSummary[]>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;

  const rows = await db.select().from(sites).orderBy(sites.id);
  const pending = await db
    .select({ siteId: pendingChanges.siteId, total: count() })
    .from(pendingChanges)
    .where(isNull(pendingChanges.resolvedAt))
    .groupBy(pendingChanges.siteId);
  const pendingBySite = new Map(pending.map((row) => [row.siteId, row.total]));
  const buildsBySite = await lastBuilds(db);

  const summaries = await Promise.all(
    rows.map(async (site): Promise<SiteSummary> => {
      const config = await currentConfig(db, site.id);
      return {
        id: site.id,
        name: site.name,
        domain: config?.domains[0] ?? '',
        lifecycle: site.lifecycle,
        state: site.state,
        pausedReason: site.pausedReason,
        release: site.release,
        indexavel: config?.indexavel ?? false,
        pendingChanges: pendingBySite.get(site.id) ?? 0,
        lastBuild: buildsBySite.get(site.id) ?? null,
      };
    }),
  );
  return { ok: true, value: summaries };
}

/** Mudanças pendentes ainda não baixadas por um build. */
export async function unresolvedPendingChangeIds(db: Executor, siteId: string): Promise<number[]> {
  const rows = await db
    .select({ id: pendingChanges.id })
    .from(pendingChanges)
    .where(and(eq(pendingChanges.siteId, siteId), isNull(pendingChanges.resolvedAt)))
    .orderBy(pendingChanges.id);
  return rows.map((row) => row.id);
}
