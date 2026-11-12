import type { Task } from 'graphile-worker';

import type { ServiceSpec } from '../../domain/builds/runtime.ts';
import {
  completePreviewUpdate,
  currentPreviewRelease,
  failPreviewUpdate,
  markPreviewWithoutVersion,
  readPreviewState,
  startPreviewUpdate,
} from '../../domain/preview/preview.ts';
import type { BuildTaskDeps } from './build.ts';

/** O que só a prévia usa, além das `BuildSettings` (rede export e URL da API de exportação). */
export type PreviewSettings = {
  /** Rede do Caddy (`orakel-internal`), que alcança o upstream `blog-preview:4321`. */
  internalNetwork: string;
  exportPreviewToken: string;
};

export type ReconcilePreviewTaskDeps = Pick<
  BuildTaskDeps,
  'db' | 'runtime' | 'settings' | 'now'
> & {
  preview: PreviewSettings;
  sleep?: (ms: number) => Promise<void>;
};

/** Apelido de rede da prévia: o upstream do Caddy (`blog-preview:4321`) não muda (ADR 0024). */
export const PREVIEW_ALIAS = 'blog-preview';
/** Limite da espera pela saúde: o healthcheck tem 12 tentativas de 10 s, mais a partida. */
export const PREVIEW_HEALTH_TIMEOUT_MS = 3 * 60_000;
export const PREVIEW_HEALTH_POLL_MS = 2_000;

/** Nome fixo do container de cada versão: o antigo é achado pela versão gravada no estado. */
export function previewContainerName(release: string): string {
  return `orakel-preview-${release}`;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Mesmo ambiente, comando e healthcheck do antigo serviço `blog-preview` do compose. */
export function previewServiceSpec(
  deps: Pick<ReconcilePreviewTaskDeps, 'settings' | 'preview'>,
  release: string,
): ServiceSpec {
  const networks = [deps.preview.internalNetwork, deps.settings.exportNetwork];
  return {
    name: previewContainerName(release),
    image: `${deps.settings.image}:${release}`,
    command: ['ssr'],
    env: {
      CONTENT_SOURCE: 'api',
      EXPORT_API_URL: deps.settings.exportApiUrl,
      EXPORT_PREVIEW_TOKEN: deps.preview.exportPreviewToken,
      PORT: '4321',
    },
    networks: networks.map((name) => ({ name, aliases: [PREVIEW_ALIAS] })),
    healthcheck: {
      test: [
        'CMD',
        'node',
        '-e',
        "fetch('http://127.0.0.1:4321/').then(() => process.exit(0), () => process.exit(1))",
      ],
      intervalMs: 10_000,
      timeoutMs: 5_000,
      retries: 12,
    },
    labels: { 'orakel.role': 'preview', 'orakel.release': release },
  };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Põe a prévia na versão corrente (workspace#84, ADR 0024 da raiz): a maior release com build
 * ok, ou `SITE_BUILDER_TAG` sem nenhuma; sem as duas, `sem_versao`. Já `no_ar` nessa versão,
 * com o container presente, não faz nada. Senão, troca blue/green: baixa a imagem se faltar,
 * sobe o container novo com o apelido `blog-preview`, espera ficar saudável e só então remove o
 * antigo. Na falha, remove o novo, mantém o antigo e grava `falhou` com o motivo, sem relançar:
 * a próxima reconciliação (build ok ou boot do build-runner) tenta de novo.
 */
export function createReconcilePreviewTask(deps: ReconcilePreviewTaskDeps): Task {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const { db, runtime } = deps;

  async function waitHealthy(id: string): Promise<string | undefined> {
    const deadline = now() + PREVIEW_HEALTH_TIMEOUT_MS;
    for (;;) {
      const health = await runtime.health(id);
      if (health === 'healthy') return undefined;
      if (health === 'unhealthy') return 'o container novo ficou unhealthy';
      if (health === 'absent') return 'o container novo sumiu antes de ficar saudável';
      if (now() >= deadline) {
        return `o container novo não ficou saudável em ${PREVIEW_HEALTH_TIMEOUT_MS / 1000} s`;
      }
      await sleep(PREVIEW_HEALTH_POLL_MS);
    }
  }

  return async (_payload, helpers) => {
    const log = helpers.logger;
    const target = (await currentPreviewRelease(db)) ?? deps.settings.defaultTag;
    if (target === undefined) {
      await markPreviewWithoutVersion(db);
      log.info('prévia sem versão: nenhuma release com build ok e sem SITE_BUILDER_TAG');
      return;
    }

    const state = await readPreviewState(db);
    const name = previewContainerName(target);
    if (
      state.status === 'no_ar' &&
      state.currentRelease === target &&
      (await runtime.health(name)) !== 'absent'
    ) {
      log.info(`prévia já no ar em ${target}`);
      return;
    }

    await startPreviewUpdate(db, target);
    const spec = previewServiceSpec(deps, target);
    let started = false;
    try {
      if (!(await runtime.imageExists(spec.image))) {
        await runtime.pullImage(spec.image);
        if (!(await runtime.imageExists(spec.image))) {
          throw new Error(`o download terminou, mas ${spec.image} não está no host`);
        }
      }
      // Sobra de uma tentativa anterior com o mesmo nome impediria o create.
      await runtime.removeContainer(name);
      started = true;
      const id = await runtime.startService(spec);
      const unhealthy = await waitHealthy(id);
      if (unhealthy !== undefined) throw new Error(unhealthy);
    } catch (error) {
      if (started) {
        await runtime.removeContainer(name).catch((removeError: unknown) => {
          log.warn(`container ${name} não removido: ${messageOf(removeError)}`);
        });
      }
      const reason = `Troca da prévia para ${target} falhou: ${messageOf(error)}`;
      await failPreviewUpdate(db, target, reason);
      log.warn(reason);
      return;
    }

    const previous = state.currentRelease;
    if (previous !== null && previous !== target) {
      const old = previewContainerName(previous);
      await runtime.removeContainer(old).catch((error: unknown) => {
        log.warn(`container antigo ${old} não removido: ${messageOf(error)}`);
      });
    }
    await completePreviewUpdate(db, target);
    log.info(`prévia no ar em ${target}`);
  };
}
