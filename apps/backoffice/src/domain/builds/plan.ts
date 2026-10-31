// O que cada container do build recebe (ADRs 0002–0005 do build-site). O render só vê a
// API de exportação e o token do build; o publish só vê o destino e o build-cache, e é o
// único com o token de deploy.
import type { BuildTarget } from './builds.ts';
import type { BuildPlan } from './run-build.ts';

export type BuildSettings = {
  image: string;
  /** Tag usada enquanto o site não tem release registrada. */
  defaultTag: string;
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

export function planBuild(target: BuildTarget, settings: BuildSettings, runId: string): BuildPlan {
  const release = target.release ?? settings.defaultTag;
  const deployEnv: Record<string, string> =
    settings.deploy.target === 'local'
      ? { DEPLOY_TARGET: 'local', EDGE_LOCAL_URL: settings.deploy.edgeLocalUrl }
      : {
          DEPLOY_TARGET: 'cloudflare',
          CLOUDFLARE_API_TOKEN: settings.deploy.apiToken,
          CLOUDFLARE_ACCOUNT_ID: settings.deploy.accountId,
        };
  return {
    siteId: target.siteId,
    release,
    image: `${settings.image}:${release}`,
    runId,
    render: {
      network: settings.exportNetwork,
      timeoutMs: RENDER_TIMEOUT_MS,
      limits: RENDER_LIMITS,
      env: {
        SITE_ID: target.siteId,
        SITE_DOMAIN: target.domain,
        RELEASE: release,
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
        ...deployEnv,
        S3_ENDPOINT: settings.s3.endpoint,
        S3_ACCESS_KEY_ID: settings.s3.accessKeyId,
        S3_SECRET_ACCESS_KEY: settings.s3.secretAccessKey,
      },
    },
  };
}
