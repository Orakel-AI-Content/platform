// Execução de um build (12.0, L3): volume próprio, container render na rede export e, com
// sucesso, container publish na rede publish. O resultado vem dos arquivos do volume
// (contrato do @orakel/build-contract); o código de saída só decide quando o arquivo falta.
// Containers e volume são sempre removidos.
import {
  BUILD_DIR,
  EXIT_CODES,
  PATHS,
  PublishResultSchema,
  ResultSchema,
  type Failure,
  type PublishResult,
  type Result,
} from '@orakel/build-contract';

import type { BUILD_STAGES } from '../../db/schema/index.ts';
import type { ContainerRuntime, ContainerSpec } from './runtime.ts';

export type BuildStage = (typeof BUILD_STAGES)[number];

type StagePlan = {
  env: Record<string, string>;
  network: string;
  timeoutMs: number;
  limits?: ContainerSpec['limits'];
};

export type BuildPlan = {
  siteId: string;
  release: string;
  image: string;
  /** Sufixo único dos nomes de volume e containers. */
  runId: string;
  render: StagePlan;
  publish: StagePlan;
};

export type RenderOk = Extract<Result, { status: 'ok' }>;
export type PublishOk = Extract<PublishResult, { status: 'ok' }>;

export type BuildOutcome =
  | { status: 'ok'; render: RenderOk; publish: PublishOk; renderMs: number; publishMs: number }
  | {
      status: 'failed';
      stage: BuildStage;
      failure: Failure;
      render?: RenderOk;
      renderMs?: number;
      publishMs?: number;
    };

type Deps = { runtime: ContainerRuntime; now: () => number; log?: (msg: string) => void };

/** Falha sem arquivo de resultado: o código de saída classifica (10 permanente; o resto, não). */
function fromExitCode(stage: BuildStage, exitCode: number): Failure {
  return {
    kind: exitCode === EXIT_CODES.permanent ? 'permanent' : 'transient',
    message: `${stage} saiu com ${exitCode} sem um ${stage === 'render' ? PATHS.result : PATHS.publish} válido`,
  };
}

function errorFailure(stage: BuildStage, error: unknown): Failure {
  // Erro do runtime (rede, proxy, daemon): transitório.
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'transient', message: `${stage}: ${message}` };
}

export async function runBuild(plan: BuildPlan, deps: Deps): Promise<BuildOutcome> {
  const { runtime, now } = deps;
  const labels = { 'orakel.build': plan.runId, 'orakel.site': plan.siteId };
  const volume = `orakel-build-${plan.runId}`;
  const containers: string[] = [];

  /** Roda uma etapa e devolve o arquivo de resultado lido do volume. */
  async function stage(
    name: 'render' | 'publish',
    stagePlan: StagePlan,
  ): Promise<{ ok: true; text: string } | { ok: false; failure: Failure }> {
    const id = await runtime.start({
      name: `orakel-${name}-${plan.runId}`,
      image: plan.image,
      command: [name],
      env: stagePlan.env,
      network: stagePlan.network,
      volume: { name: volume, target: BUILD_DIR },
      ...(stagePlan.limits && { limits: stagePlan.limits }),
      labels: { ...labels, 'orakel.stage': name },
    });
    containers.push(id);
    const waited = await runtime.wait(id, stagePlan.timeoutMs);
    if ('timedOut' in waited) {
      await runtime.kill(id);
      return {
        ok: false,
        failure: {
          kind: 'transient',
          message: `${name} passou de ${Math.round(stagePlan.timeoutMs / 60_000)} min e foi interrompido`,
        },
      };
    }
    const file = name === 'render' ? PATHS.result : PATHS.publish;
    const text = await runtime.readFile(id, `${BUILD_DIR}/${file}`);
    if (text === undefined) return { ok: false, failure: fromExitCode(name, waited.exitCode) };
    return { ok: true, text };
  }

  let current: BuildStage = 'image';
  let render: RenderOk | undefined;
  let renderMs: number | undefined;
  try {
    if (!(await runtime.imageExists(plan.image))) {
      return {
        status: 'failed',
        stage: 'image',
        failure: {
          kind: 'permanent',
          message: `A imagem ${plan.image} não está no host (o build não baixa imagens)`,
        },
      };
    }

    current = 'render';
    const startedAt = now();
    await runtime.createVolume(volume, labels);

    const rendered = await stage('render', plan.render);
    renderMs = now() - startedAt;
    if (!rendered.ok)
      return { status: 'failed', stage: 'render', failure: rendered.failure, renderMs };
    const parsed = ResultSchema.safeParse(JSON.parse(rendered.text));
    if (!parsed.success || parsed.data.site !== plan.siteId) {
      return {
        status: 'failed',
        stage: 'render',
        failure: { kind: 'transient', message: `${PATHS.result} inválido ou de outro site` },
        renderMs,
      };
    }
    if (parsed.data.status === 'failed') {
      return { status: 'failed', stage: 'render', failure: parsed.data.failure, renderMs };
    }
    render = parsed.data;

    current = 'publish';
    const publishStart = now();
    const published = await stage('publish', plan.publish);
    const publishMs = now() - publishStart;
    if (!published.ok) {
      return {
        status: 'failed',
        stage: 'publish',
        failure: published.failure,
        render,
        renderMs,
        publishMs,
      };
    }
    const publishParsed = PublishResultSchema.safeParse(JSON.parse(published.text));
    if (!publishParsed.success || publishParsed.data.site !== plan.siteId) {
      return {
        status: 'failed',
        stage: 'publish',
        failure: { kind: 'transient', message: `${PATHS.publish} inválido ou de outro site` },
        render,
        renderMs,
        publishMs,
      };
    }
    if (publishParsed.data.status === 'failed') {
      return {
        status: 'failed',
        stage: 'publish',
        failure: publishParsed.data.failure,
        render,
        renderMs,
        publishMs,
      };
    }
    return { status: 'ok', render, publish: publishParsed.data, renderMs, publishMs };
  } catch (error) {
    return {
      status: 'failed',
      stage: current,
      failure: errorFailure(current, error),
      ...(render && { render }),
      ...(renderMs !== undefined && { renderMs }),
    };
  } finally {
    for (const id of containers) {
      await runtime.removeContainer(id).catch((error: unknown) => {
        deps.log?.(`Container ${id} não removido: ${String(error)}`);
      });
    }
    await runtime.removeVolume(volume).catch((error: unknown) => {
      deps.log?.(`Volume ${volume} não removido: ${String(error)}`);
    });
  }
}
