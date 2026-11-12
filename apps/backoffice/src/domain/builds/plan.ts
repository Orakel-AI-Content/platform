// O que cada container do build recebe (ADRs 0002–0005 do build-site). O render só vê a
// API de exportação e o token do build; o publish só vê o destino e o build-cache, e é o
// único com o token de deploy.
import type { BuildTarget } from './builds.ts';
import type { BuildPlan } from './run-build.ts';
import type { RollbackPlan } from './run-rollback.ts';

export type BuildSettings = {
  image: string;
  /**
   * Tag usada enquanto o site não tem release registrada (só no local e no E2E). Sem ela, o site
   * sem versão é recusado.
   */
  defaultTag?: string;
  exportNetwork: string;
  publishNetwork: string;
  exportApiUrl: string;
  exportBuildToken: string;
  pageDropTolerance: number;
  deploy:
    | { target: 'local'; edgeLocalUrl: string }
    | { target: 'cloudflare'; apiToken: string; accountId: string };
  s3: { endpoint: string; accessKeyId: string; secretAccessKey: string };
};

/** Limites do render (proposta do 12.0): 3 vCPU, 6 GB, prioridade baixa. */
export const RENDER_LIMITS = { cpus: 3, memoryBytes: 6 * 1024 ** 3, cpuShares: 256 };
export const RENDER_TIMEOUT_MS = 20 * 60_000;
export const PUBLISH_TIMEOUT_MS = 10 * 60_000;
/** O rollback só troca a versão ativa no alvo: bem mais curto que o publish. */
export const ROLLBACK_TIMEOUT_MS = 5 * 60_000;

/**
 * Motivo da recusa do site sem release e sem tag padrão: a etapa `image` falha permanente com
 * ele, e o site é pausado até alguém atualizar a versão.
 */
export const SITE_WITHOUT_RELEASE = 'site sem versão: use Atualizar para a mais recente';

/** Release do site, ou a tag padrão; nula quando não há nenhuma das duas. */
export function resolveRelease(target: BuildTarget, defaultTag: string | undefined): string | null {
  return target.release ?? defaultTag ?? null;
}

function imageOf(settings: BuildSettings, release: string | null): string | null {
  return release === null ? null : `${settings.image}:${release}`;
}

/** Alvo do deploy e o acesso a ele: o mesmo para o publish e o rollback, sem divergir. */
function deployEnv(settings: BuildSettings): Record<string, string> {
  return settings.deploy.target === 'local'
    ? { DEPLOY_TARGET: 'local', EDGE_LOCAL_URL: settings.deploy.edgeLocalUrl }
    : {
        DEPLOY_TARGET: 'cloudflare',
        CLOUDFLARE_API_TOKEN: settings.deploy.apiToken,
        CLOUDFLARE_ACCOUNT_ID: settings.deploy.accountId,
      };
}

export function planBuild(target: BuildTarget, settings: BuildSettings, runId: string): BuildPlan {
  const release = resolveRelease(target, settings.defaultTag);
  return {
    siteId: target.siteId,
    release,
    image: imageOf(settings, release),
    runId,
    render: {
      network: settings.exportNetwork,
      timeoutMs: RENDER_TIMEOUT_MS,
      limits: RENDER_LIMITS,
      env: {
        SITE_ID: target.siteId,
        SITE_DOMAIN: target.domain,
        RELEASE: release ?? '',
        EXPORT_API_URL: settings.exportApiUrl,
        EXPORT_BUILD_TOKEN: settings.exportBuildToken,
        PAGE_DROP_TOLERANCE: String(settings.pageDropTolerance),
        ALLOW_MASS_UNPUBLISH: target.massUnpublishDeclaredAt === null ? 'false' : 'true',
        ...(target.activePages !== undefined && {
          ACTIVE_PAGE_COUNT: String(target.activePages),
        }),
      },
    },
    publish: {
      network: settings.publishNetwork,
      timeoutMs: PUBLISH_TIMEOUT_MS,
      env: {
        SITE_ID: target.siteId,
        ...deployEnv(settings),
        S3_ENDPOINT: settings.s3.endpoint,
        S3_ACCESS_KEY_ID: settings.s3.accessKeyId,
        S3_SECRET_ACCESS_KEY: settings.s3.secretAccessKey,
      },
    },
  };
}

/**
 * Rollback (ADR 0009 do build-site): a imagem da release do site, na rede do publish, com o
 * alvo e a versão pedida. Não recebe S3 nem a API de exportação: não lê o build-cache.
 */
export function planRollback(
  target: BuildTarget,
  settings: BuildSettings,
  versionId: string,
  runId: string,
): RollbackPlan {
  const release = resolveRelease(target, settings.defaultTag);
  return {
    siteId: target.siteId,
    versionId,
    release,
    image: imageOf(settings, release),
    runId,
    network: settings.publishNetwork,
    timeoutMs: ROLLBACK_TIMEOUT_MS,
    env: { SITE_ID: target.siteId, VERSION_ID: versionId, ...deployEnv(settings) },
  };
}
