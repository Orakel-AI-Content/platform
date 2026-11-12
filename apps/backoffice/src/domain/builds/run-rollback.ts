// Execução de um rollback (ADR 0009 do build-site): volume próprio e um único container
// rollback na rede publish, no padrão do runBuild. O resultado vem do rollback.json do
// volume (contrato do @orakel/build-contract); o código de saída só decide quando o arquivo
// falta. Na falha, o fim do log do container é lido antes de ele sair. Container e volume são
// sempre removidos.
import {
  BUILD_DIR,
  EXIT_CODES,
  PATHS,
  RollbackResultSchema,
  type Failure,
  type RollbackResult,
} from '@orakel/build-contract';

import { readLogTail, type ContainerRuntime } from './runtime.ts';

export type RollbackPlan = {
  siteId: string;
  /** Versão já publicada que deve voltar a ficar ativa. */
  versionId: string;
  release: string;
  image: string;
  /** Sufixo único dos nomes de volume e container. */
  runId: string;
  network: string;
  timeoutMs: number;
  env: Record<string, string>;
};

export type RollbackOk = Extract<RollbackResult, { status: 'ok' }>;

export type RollbackOutcome =
  | { status: 'ok'; rollback: RollbackOk; durationMs: number }
  | {
      status: 'failed';
      failure: Failure;
      durationMs?: number;
      /** Fim do log do container, quando ele chegou a existir. */
      logTail?: string;
    };

type Deps = { runtime: ContainerRuntime; now: () => number; log?: (msg: string) => void };

function parseFile(text: string): RollbackResult | undefined {
  try {
    const parsed = RollbackResultSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function runRollback(plan: RollbackPlan, deps: Deps): Promise<RollbackOutcome> {
  const { runtime, now } = deps;
  const labels = { 'orakel.build': plan.runId, 'orakel.site': plan.siteId };
  const volume = `orakel-build-${plan.runId}`;
  let container: string | undefined;
  let startedAt: number | undefined;
  const elapsed = () => (startedAt === undefined ? {} : { durationMs: now() - startedAt });

  async function attempt(): Promise<RollbackOutcome> {
    if (!(await runtime.imageExists(plan.image))) {
      return {
        status: 'failed',
        failure: {
          kind: 'permanent',
          message: `A imagem ${plan.image} não está no host (o rollback não baixa imagens)`,
        },
      };
    }

    startedAt = now();
    await runtime.createVolume(volume, labels);
    container = await runtime.start({
      name: `orakel-rollback-${plan.runId}`,
      image: plan.image,
      command: ['rollback'],
      env: plan.env,
      network: plan.network,
      volume: { name: volume, target: BUILD_DIR },
      labels: { ...labels, 'orakel.stage': 'rollback' },
    });
    const waited = await runtime.wait(container, plan.timeoutMs);
    if ('timedOut' in waited) {
      await runtime.kill(container);
      return {
        status: 'failed',
        failure: {
          kind: 'transient',
          message: `rollback passou de ${Math.round(plan.timeoutMs / 60_000)} min e foi interrompido`,
        },
        ...elapsed(),
      };
    }

    const text = await runtime.readFile(container, `${BUILD_DIR}/${PATHS.rollback}`);
    if (text === undefined) {
      return {
        status: 'failed',
        failure: {
          kind: waited.exitCode === EXIT_CODES.permanent ? 'permanent' : 'transient',
          message: `rollback saiu com ${waited.exitCode} sem um ${PATHS.rollback} válido`,
        },
        ...elapsed(),
      };
    }
    const result = parseFile(text);
    if (result === undefined || result.site !== plan.siteId) {
      return {
        status: 'failed',
        failure: { kind: 'transient', message: `${PATHS.rollback} inválido ou de outro site` },
        ...elapsed(),
      };
    }
    if (result.status === 'failed') {
      return { status: 'failed', failure: result.failure, ...elapsed() };
    }
    if (result.versionId !== plan.versionId) {
      return {
        status: 'failed',
        failure: {
          kind: 'transient',
          message: `${PATHS.rollback} ativou ${result.versionId}, não a versão pedida ${plan.versionId}`,
        },
        ...elapsed(),
      };
    }
    return { status: 'ok', rollback: result, durationMs: now() - startedAt };
  }

  try {
    const outcome = await attempt().catch((error: unknown): RollbackOutcome => {
      // Erro do runtime (rede, proxy, daemon): transitório.
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'failed', failure: { kind: 'transient', message: `rollback: ${message}` } };
    });
    if (outcome.status === 'ok' || container === undefined) return outcome;
    const logTail = await readLogTail(runtime, container, deps.log);
    return logTail === undefined ? outcome : { ...outcome, logTail };
  } finally {
    if (container !== undefined) {
      const id = container;
      await runtime.removeContainer(id).catch((error: unknown) => {
        deps.log?.(`Container ${id} não removido: ${String(error)}`);
      });
    }
    if (startedAt !== undefined) {
      await runtime.removeVolume(volume).catch((error: unknown) => {
        deps.log?.(`Volume ${volume} não removido: ${String(error)}`);
      });
    }
  }
}
