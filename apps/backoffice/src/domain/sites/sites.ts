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
import { effectiveBuildWindowMs } from '../builds/schedule.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { hasPolicyTrigger } from './policy-triggers.ts';

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
  /** Janela de agrupamento própria do site, em segundos; nula usa a padrão. */
  buildWindowSeconds: number | null;
  /** Janela que o agendamento usa para o site, em segundos. */
  effectiveBuildWindowSeconds: number;
};

/** Schema e validação semântica da configuração v1, contra os recursos da release. */
function parseSiteConfig(input: SiteConfig, resources: Resources): Result<SiteConfig> {
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
  return validateSiteConfig(parsed.data, resources);
}

/**
 * Indexação só depois do G1 (RN-SIT-07): `indexavel: true` exige o gatilho registrado para o
 * site. Desligar é sempre aceito; um site novo ainda não tem G1.
 */
async function checkIndexing(tx: Executor, config: SiteConfig): Promise<Result<void>> {
  if (!config.indexavel || (await hasPolicyTrigger(tx, config.siteId, 'G1'))) {
    return { ok: true, value: undefined };
  }
  return {
    ok: false,
    issues: [
      {
        code: 'site.g1_required',
        message: `O site ${config.siteId} só pode ficar indexável depois do G1 registrado`,
        path: ['indexavel'],
      },
    ],
  };
}

/** Cadastra um site com a configuração v1, validada contra os recursos da release. */
export async function createSite(
  tx: Executor,
  actor: Actor,
  input: SiteConfig,
  resources: Resources = RESOURCES,
): Promise<Result<{ siteId: string }>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const validated = parseSiteConfig(input, resources);
  if (!validated.ok) return validated;
  const config = validated.value;
  const indexing = await checkIndexing(tx, config);
  if (!indexing.ok) return indexing;

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

/**
 * Edita a configuração: grava a versão N+1 (a N fica intacta) e registra a mudança pendente.
 * O SITE_ID não muda (entra nos IDs de reconciliação de afiliados), e os textos
 * institucionais vêm da versão corrente: a edição deles é de outro fluxo, e um formulário
 * sem o campo não pode apagá-los.
 */
export async function updateSiteConfig(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: SiteConfig,
  resources: Resources = RESOURCES,
): Promise<Result<{ version: number }>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  const [current] = await tx
    .select({ version: siteConfigs.version, config: siteConfigs.config })
    .from(siteConfigs)
    .where(eq(siteConfigs.siteId, siteId))
    .orderBy(desc(siteConfigs.version))
    .limit(1);
  if (current === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  if (input.siteId !== siteId) {
    return {
      ok: false,
      issues: [
        {
          code: 'site.id_mismatch',
          message: `O SITE_ID não muda: a configuração é de ${input.siteId}, o site é ${siteId}`,
          path: ['siteId'],
        },
      ],
    };
  }

  const candidate: SiteConfig = { ...input };
  delete candidate.institutionalTexts;
  const { institutionalTexts } = current.config;
  if (institutionalTexts !== undefined) candidate.institutionalTexts = institutionalTexts;
  const validated = parseSiteConfig(candidate, resources);
  if (!validated.ok) return validated;
  const config = validated.value;
  const indexing = await checkIndexing(tx, config);
  if (!indexing.ok) return indexing;

  const version = current.version + 1;
  await tx.insert(siteConfigs).values({ siteId, version, config });
  await tx.update(sites).set({ name: config.name }).where(eq(sites.id, siteId));
  await recordPendingChange(tx, siteId, 'config', `v${version}`);
  return { ok: true, value: { version } };
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
        buildWindowSeconds: site.buildWindowSeconds,
        effectiveBuildWindowSeconds: effectiveBuildWindowMs(site.buildWindowSeconds) / 1000,
      };
    }),
  );
  return { ok: true, value: summaries };
}

/** Nome do arquivo de sites da raiz do OpenTofu (ADR 0011). */
export const TFVARS_FILENAME = 'sites.auto.tfvars.json';

/**
 * `sites.auto.tfvars.json` (ADR 0011): objeto `sites` por SITE_ID, pronto para `for_each`, com
 * os domínios de cada site (o principal primeiro). Sites em ordem de SITE_ID e serialização
 * fixa: o mesmo registro gera os mesmos bytes.
 */
export async function exportSitesTfvars(db: Executor, actor: Actor): Promise<Result<string>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;

  // Ordem por código, não pela collation do banco: a mesma em qualquer ambiente.
  const ids = (await db.select({ id: sites.id }).from(sites)).map((row) => row.id).sort();
  const entries: Record<string, { domains: string[] }> = {};
  for (const id of ids) {
    entries[id] = { domains: (await currentConfig(db, id))?.domains ?? [] };
  }
  return { ok: true, value: `${JSON.stringify({ sites: entries }, null, 2)}\n` };
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
