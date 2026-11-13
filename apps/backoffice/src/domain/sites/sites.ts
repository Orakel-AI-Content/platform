import type { Culprit } from '@orakel/build-contract';
import {
  InstitutionalTextsSchema,
  SiteConfigSchema,
  validateSiteConfig,
  RESOURCES,
  type Resources,
  type SiteConfig,
} from '@orakel/content-model/v1';
import type { Result } from '@orakel/content-model';
import { redirectUsage, type RedirectUsage } from '@orakel/core/v1';
import { isThemeId } from '@orakel/tokens';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import type { Executor } from '../../db/client.ts';
import { pendingChanges, redirects, siteConfigs, sites } from '../../db/schema/index.ts';
import { requireRole, type Actor } from '../access/rbac.ts';
import {
  activeBuild,
  activeSince,
  lastBuilds,
  recentBuilds,
  type ActiveSince,
  type LastBuild,
  type RecentBuild,
} from '../builds/builds.ts';
import { effectiveBuildWindowMs } from '../builds/schedule.ts';
import { isInfraCheckStep, scheduleSiteInfraCheck, siteInfraJobKey } from '../builds/site-state.ts';
import { toRedirect } from '../export/mappers.ts';
import { countPendingChangesByOrigin, type PendingOriginCount } from '../pending-changes/list.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { effectiveDailyPublishLimit, publishedOnDayBySite } from '../publications/publish.ts';
import { latestAvailableRelease } from '../releases/releases.ts';
import { hasPolicyTrigger } from './policy-triggers.ts';

/** Textos das páginas institucionais (o content-model só exporta o schema). */
export type InstitutionalTexts = NonNullable<SiteConfig['institutionalTexts']>;

/** Fuso de um site sem configuração gravada: o padrão do formulário de cadastro. */
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export type SiteSummary = {
  id: string;
  name: string;
  domain: string;
  lifecycle: (typeof sites.$inferSelect)['lifecycle'];
  state: (typeof sites.$inferSelect)['state'];
  pausedReason: string | null;
  /** Conteúdo que causou a pausa, quando a falha o apontou. */
  pausedCulprit: Culprit | null;
  /** Versão no ar (`versionId` do deploy); nula até a primeira publicação. */
  activeVersionId: string | null;
  release: string | null;
  indexavel: boolean;
  pendingChanges: number;
  lastBuild: LastBuild | null;
  /** Janela de agrupamento própria do site, em segundos; nula usa a padrão. */
  buildWindowSeconds: number | null;
  /** Janela que o agendamento usa para o site, em segundos. */
  effectiveBuildWindowSeconds: number;
  /** Limite diário de publicações próprio do site; nulo usa o padrão (#490). */
  dailyPublishLimit: number | null;
  /** Limite diário que a publicação aplica ao site. */
  effectiveDailyPublishLimit: number;
  /** Vagas do limite já ocupadas hoje (dia de São Paulo): publicações feitas e agendadas. */
  publishedToday: number;
  /** Fuso IANA da configuração corrente: as telas mostram as datas do site nele. */
  timeZone: string;
  /** Última conferência da infra contra a descrição atual (workspace#98). */
  infraDrift: InfraDrift;
};

/**
 * Conferência da infra contra a descrição atual: o último resultado conhecido (nulo se
 * nenhuma conferência terminou bem) e a última conferência, com o motivo se ela falhou.
 */
export type InfraDrift = {
  status: (typeof sites.$inferSelect)['infraDriftStatus'];
  /** Resumo das mudanças do plano, quando `desatualizado`. */
  summary: string | null;
  /** Quando a última conferência terminou, com ou sem sucesso; nulo se nunca houve. */
  checkedAt: Date | null;
  /** Motivo da última conferência, se ela falhou; nulo no sucesso. */
  error: string | null;
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
  // Tema contra os temas do código atual (@orakel/tokens), não os da release (workspace#26).
  if (!isThemeId(parsed.data.theme)) {
    return {
      ok: false,
      issues: [
        {
          code: 'site.theme_unknown',
          message: `Tema "${parsed.data.theme}" não existe`,
          path: ['theme'],
        },
      ],
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

/**
 * Cadastra um site com a configuração v1, validada contra os recursos da release. O site nasce
 * na release `disponivel` mais recente (nula sem nenhuma, e o build cai no `SITE_BUILDER_TAG`);
 * não é uma troca de versão, então não grava `site_events`.
 */
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

  const release = await latestAvailableRelease(tx);
  await tx.insert(sites).values({ id: config.siteId, name: config.name, release });
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
          message: `O ID do site não muda: a configuração é de ${input.siteId}, o site é ${siteId}`,
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

  return writeConfigVersion(tx, siteId, current.version + 1, config);
}

/** Grava a versão nova da configuração (a anterior fica intacta) e a mudança pendente. */
async function writeConfigVersion(
  tx: Executor,
  siteId: string,
  version: number,
  config: SiteConfig,
): Promise<Result<{ version: number }>> {
  await tx.insert(siteConfigs).values({ siteId, version, config });
  await tx.update(sites).set({ name: config.name }).where(eq(sites.id, siteId));
  await recordPendingChange(tx, siteId, 'config', `v${version}`);
  return { ok: true, value: { version } };
}

/**
 * Textos institucionais do site, editados por quem escreve conteúdo (`content.write`): a
 * versão N+1 da configuração é a N com só esse campo trocado. Os demais campos continuam
 * exigindo `site.configure` (updateSiteConfig).
 */
export async function updateInstitutionalTexts(
  tx: Executor,
  actor: Actor,
  siteId: string,
  texts: InstitutionalTexts,
): Promise<Result<{ version: number }>> {
  const allowed = requireRole(actor, 'content.write');
  if (!allowed.ok) return allowed;
  const parsed = InstitutionalTextsSchema.safeParse(texts);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        code: `schema.${i.code}`,
        message: i.message,
        path: ['institutionalTexts', ...i.path],
      })),
    };
  }

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
  return writeConfigVersion(tx, siteId, current.version + 1, {
    ...current.config,
    institutionalTexts: parsed.data,
  });
}

/** Textos institucionais da configuração corrente (vazio quando o site não os tem). */
export async function getInstitutionalTexts(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<InstitutionalTexts>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const config = await currentConfig(db, siteId);
  if (config === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  return { ok: true, value: config.institutionalTexts ?? {} };
}

/**
 * Uso do `_redirects` do site (workspace#20, R6): os redirects do banco pelo `redirectUsage`
 * do core, o mesmo cálculo do build. O limiar do alerta (75%) e a separação entre estáticos e
 * dinâmicos ficam só no core.
 */
export async function redirectUsageFor(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<RedirectUsage>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const rows = await db.select().from(redirects).where(eq(redirects.siteId, siteId));
  return { ok: true, value: redirectUsage(rows.map(toRedirect)) };
}

export async function siteExists(db: Executor, siteId: string): Promise<boolean> {
  const rows = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  return rows.length > 0;
}

/**
 * Recursos da release registrada para o site: o editor e a validação de conteúdo os obtêm só
 * por aqui. Enquanto não há registro de recursos por release (workspace#26), toda release,
 * inclusive a nula de um site ainda não promovido, usa os `RESOURCES` do código.
 */
export async function resourcesFor(db: Executor, siteId: string): Promise<Resources> {
  // A release já é lida aqui: a workspace#26 troca só o retorno, sem mudar quem chama.
  await db.select({ release: sites.release }).from(sites).where(eq(sites.id, siteId));
  return RESOURCES;
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
function pausedCulprit(
  site: Pick<typeof sites.$inferSelect, 'pausedCulpritOrigin' | 'pausedCulpritReference'>,
): Culprit | null {
  if (site.pausedCulpritOrigin === null || site.pausedCulpritReference === null) return null;
  return { origin: site.pausedCulpritOrigin, reference: site.pausedCulpritReference };
}

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
  const publishedToday = await publishedOnDayBySite(db);

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
        pausedCulprit: pausedCulprit(site),
        activeVersionId: site.activeVersionId,
        release: site.release,
        indexavel: config?.indexavel ?? false,
        pendingChanges: pendingBySite.get(site.id) ?? 0,
        lastBuild: buildsBySite.get(site.id) ?? null,
        buildWindowSeconds: site.buildWindowSeconds,
        effectiveBuildWindowSeconds: effectiveBuildWindowMs(site.buildWindowSeconds) / 1000,
        dailyPublishLimit: site.dailyPublishLimit,
        effectiveDailyPublishLimit: effectiveDailyPublishLimit(site.dailyPublishLimit),
        publishedToday: publishedToday.get(site.id) ?? 0,
        timeZone: config?.timeZone ?? DEFAULT_TIME_ZONE,
        infraDrift: {
          status: site.infraDriftStatus,
          summary: site.infraDriftSummary,
          checkedAt: site.infraDriftCheckedAt,
          error: site.infraDriftError,
        },
      };
    }),
  );
  return { ok: true, value: summaries };
}

/**
 * Estado da instância que só a página do site mostra (#516), fora do `SiteSummary` para não
 * pesar em `listSites`, que toda tela do admin lê.
 */
export type SiteInstance = {
  /** Os últimos builds do site, do mais novo para o mais antigo. */
  recentBuilds: RecentBuild[];
  /** Arquivos do build da versão ativa; nulo sem versão no ar ou sem o build dela. */
  activeFiles: number | null;
  /** Páginas do build da versão ativa; nulo como `activeFiles`. */
  activePages: number | null;
  /** Quando a versão ativa entrou no ar e quem pediu (#647); nulo sem versão no ar. */
  activeSince: ActiveSince | null;
  /** Mudanças pendentes por origem. */
  pendingByOrigin: PendingOriginCount[];
};

export async function readSiteInstance(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<SiteInstance>> {
  const pendingByOrigin = await countPendingChangesByOrigin(db, actor, siteId);
  if (!pendingByOrigin.ok) return pendingByOrigin;
  const [site] = await db
    .select({ activeVersionId: sites.activeVersionId })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) {
    return {
      ok: false,
      issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
    };
  }
  const active = await activeBuild(db, siteId, site.activeVersionId);
  const since = await activeSince(db, siteId, site.activeVersionId);
  return {
    ok: true,
    value: {
      recentBuilds: await recentBuilds(db, siteId),
      activeFiles: active?.files ?? null,
      activePages: active?.pages ?? null,
      activeSince: since ?? null,
      pendingByOrigin: pendingByOrigin.value,
    },
  };
}

/**
 * Conferência da infra de um site (workspace#85), para a etapa "Infra e zona" da página do
 * site: a etapa do ciclo de vida, a última conferência gravada pelo job e se há outra na fila.
 * O motivo de não ter avançado sai da etapa: conferido sem erro em `cadastrado`, a zona não
 * existe; em `infra_aplicada`, ainda está pendente.
 */
export type SiteInfraCheck = {
  lifecycle: SiteSummary['lifecycle'];
  /** Quando a última conferência terminou; nulo se nunca houve. */
  checkedAt: Date | null;
  /** Mensagem da última conferência quando o provedor não respondeu; nula no sucesso. */
  error: string | null;
  /** Há conferência do site na fila ou rodando. */
  queued: boolean;
};

function siteNotFound(siteId: string): Result<never> {
  return {
    ok: false,
    issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
  };
}

/**
 * Lê a conferência da infra do site (`site.read`). Conta como na fila o job da chave do site
 * que ainda vai rodar ou está rodando; o que falhou de vez (uma tentativa só) fica na tabela
 * do Graphile e não conta, senão a tela consultaria para sempre.
 */
export async function readSiteInfraCheck(
  db: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<SiteInfraCheck>> {
  const allowed = requireRole(actor, 'site.read');
  if (!allowed.ok) return allowed;
  const [site] = await db
    .select({
      lifecycle: sites.lifecycle,
      checkedAt: sites.infraCheckedAt,
      error: sites.infraCheckError,
    })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return siteNotFound(siteId);
  const { rows } = await db.execute<{ queued: boolean }>(sql`
    select exists (
      select 1 from graphile_worker._private_jobs
      where key = ${siteInfraJobKey(siteId)}
        and (locked_at is not null or attempts < max_attempts)
    ) as queued`);
  return { ok: true, value: { ...site, queued: rows[0]?.queued === true } };
}

/**
 * "Conferir agora" (workspace#85): enfileira a conferência só deste site, no job do cron
 * (`scheduleSiteInfraCheck`, um job por site). Só com `site.configure` e com o site numa
 * etapa que a conferência ainda avança (`cadastrado` ou `infra_aplicada`).
 */
export async function requestSiteInfraCheck(
  tx: Executor,
  actor: Actor,
  siteId: string,
): Promise<Result<void>> {
  const allowed = requireRole(actor, 'site.configure');
  if (!allowed.ok) return allowed;
  const [site] = await tx
    .select({ lifecycle: sites.lifecycle })
    .from(sites)
    .where(eq(sites.id, siteId));
  if (site === undefined) return siteNotFound(siteId);
  if (!isInfraCheckStep(site.lifecycle)) {
    return {
      ok: false,
      issues: [
        {
          code: 'site.infra_check_step',
          message: `A infra só é conferida com o site em cadastrado ou infra_aplicada; o site está em ${site.lifecycle}`,
          path: ['lifecycle'],
        },
      ],
    };
  }
  await scheduleSiteInfraCheck(tx, siteId);
  return { ok: true, value: undefined };
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
