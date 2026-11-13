// Drivers da criação da infraestrutura do site (INFRA_DRIVER, ADR 0027 da raiz). `tofu` roda o
// plano e o apply no container do infra-runner, pelo ContainerRuntime: um volume próprio da
// execução guarda o plano salvo do `plan` ao `apply` e é apagado no fim do apply (ou na falha do
// plano); o container, sempre. O andamento vem do `-json` do tofu no log do container, lido em
// fatias durante a espera. `local` percorre as mesmas etapas sem rede nem segredos, com memória
// do que já "criou" e uma falha forçável, para o compose local e o E2E.
import {
  EXIT_CODES,
  INFRA_DIR,
  INFRA_PATHS,
  InfraApplyResultSchema,
  InfraChangeSchema,
  InfraPlanResultSchema,
  type InfraChange,
} from '@orakel/build-contract';
import * as z from 'zod';

import { INFRA_STEPS, type InfraStep } from '../../db/schema/index.ts';
import {
  ImageUnavailableError,
  readLogTail,
  type ContainerRuntime,
  type WaitResult,
} from '../builds/runtime.ts';

/** O site e a execução de infra a que o plano e o apply pertencem. */
export type InfraTarget = { runId: number; siteId: string; domain: string };

/** Falha do plano ou do apply; não há repetição automática ("Tentar de novo" é outra execução). */
export type InfraFailure = { kind: 'permanent' | 'transient'; message: string };

/** Resumo do plano gravado em `infra_runs.planSummary`: os recursos que mudam, por etapa. */
export const InfraPlanSummarySchema = z.object({
  formatVersion: z.literal(1),
  steps: z.object(
    Object.fromEntries(INFRA_STEPS.map((step) => [step, z.array(InfraChangeSchema)])) as Record<
      InfraStep,
      z.ZodArray<typeof InfraChangeSchema>
    >,
  ),
});
export type InfraPlanSummary = z.infer<typeof InfraPlanSummarySchema>;

export type InfraPlanOutcome =
  { status: 'ok'; summary: InfraPlanSummary } | { status: 'failed'; failure: InfraFailure };

export type InfraApplyOutcome =
  | { status: 'ok'; nameservers: string[] }
  /** `step`: a etapa em que o apply parou; nula quando nenhum recurso chegou a começar. */
  | { status: 'failed'; step: InfraStep | null; failure: InfraFailure };

export interface InfraDriver {
  readonly kind: 'tofu' | 'local';
  plan(target: InfraTarget): Promise<InfraPlanOutcome>;
  /** `onStep` a cada etapa nova, na ordem de `INFRA_STEPS` (nunca volta). */
  apply(
    target: InfraTarget,
    onStep: (step: InfraStep) => Promise<void>,
  ): Promise<InfraApplyOutcome>;
}

/**
 * Etapa de um tipo de recurso do módulo `infra/modules/site`, nos termos de quem opera. O que
 * não é zona, DNS, e-mail nem armazenamento é regra da zona (rulesets, zone settings, cache,
 * bot management).
 */
export function stepOfResourceType(type: string): InfraStep {
  if (type === 'cloudflare_zone') return 'endereco';
  if (type === 'cloudflare_dns_record') return 'dns';
  if (type.startsWith('cloudflare_email_routing')) return 'email';
  if (type.startsWith('cloudflare_r2')) return 'imagens';
  return 'regras';
}

/** Agrupa os recursos do plano por etapa; toda etapa aparece, vazia quando nada muda nela. */
export function summarizePlan(changes: readonly InfraChange[]): InfraPlanSummary {
  const steps = Object.fromEntries(
    INFRA_STEPS.map((step) => [step, [] as InfraChange[]]),
  ) as Record<InfraStep, InfraChange[]>;
  for (const change of changes) steps[stepOfResourceType(change.type)].push(change);
  return { formatVersion: 1, steps };
}

const stepIndex = (step: InfraStep) => INFRA_STEPS.indexOf(step);

/** O que o log `-json` do apply diz até agora: a etapa mais adiantada e a do recurso que falhou. */
export type ApplyProgress = { current: InfraStep | null; errored: InfraStep | null };

/**
 * Lê as linhas `-json` do tofu: `apply_start` avança a etapa corrente (só para a frente: o tofu
 * cria recursos de etapas diferentes em paralelo) e `apply_errored` aponta a etapa da falha.
 * Linhas que não são JSON (avisos do entrypoint no stderr) são ignoradas.
 */
export function readApplyProgress(log: string): ApplyProgress {
  let current: InfraStep | null = null;
  let errored: InfraStep | null = null;
  for (const line of log.split('\n')) {
    if (!line.startsWith('{')) continue;
    let entry: { type?: unknown; hook?: { resource?: { resource_type?: unknown } } };
    try {
      entry = JSON.parse(line) as typeof entry;
    } catch {
      continue;
    }
    const type = entry.hook?.resource?.resource_type;
    if (typeof type !== 'string') continue;
    const step = stepOfResourceType(type);
    if (
      entry.type === 'apply_start' &&
      (current === null || stepIndex(step) > stepIndex(current))
    ) {
      current = step;
    }
    if (entry.type === 'apply_errored' && errored === null) errored = step;
  }
  return { current, errored };
}

// --- tofu --------------------------------------------------------------------------------

export type TofuDriverOptions = {
  runtime: ContainerRuntime;
  /** `INFRA_RUNNER_IMAGE:INFRA_RUNNER_TAG`. */
  image: string;
  /** Rede com saída para a internet (a publish): a API da Cloudflare e o R2 do estado. */
  network: string;
  /**
   * Entrada do container que não muda por site: `CLOUDFLARE_ACCOUNT_ID`, `EMAIL_FORWARD_TO` e
   * os quatro segredos de infra. Nada além disso chega ao container.
   */
  env: Record<string, string>;
  now?: () => number;
  log?: (msg: string) => void;
  /** Prazos de cada comando e intervalo da leitura do andamento. */
  timeouts?: { planMs: number; applyMs: number; pollMs: number };
};

const DEFAULT_TIMEOUTS = { planMs: 10 * 60_000, applyMs: 30 * 60_000, pollMs: 2_000 };
/** Linhas do log lidas a cada fatia: o apply de um site tem algumas dezenas de recursos. */
const PROGRESS_LOG_LINES = 2_000;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function tofuDriver(options: TofuDriverOptions): InfraDriver {
  const { runtime } = options;
  const timeouts = options.timeouts ?? DEFAULT_TIMEOUTS;
  const now = options.now ?? Date.now;
  const volumeOf = (target: InfraTarget) => `orakel-infra-${target.runId}`;
  const labels = (target: InfraTarget) => ({
    'orakel.infra': String(target.runId),
    'orakel.site': target.siteId,
  });

  async function ensureImage(): Promise<InfraFailure | undefined> {
    try {
      if (await runtime.imageExists(options.image)) return undefined;
      await runtime.pullImage(options.image);
      if (await runtime.imageExists(options.image)) return undefined;
      return { kind: 'transient', message: `A imagem ${options.image} não chegou ao host` };
    } catch (error) {
      return {
        kind: error instanceof ImageUnavailableError ? 'permanent' : 'transient',
        message: `A imagem ${options.image} não foi baixada: ${message(error)}`,
      };
    }
  }

  /**
   * Roda um comando do infra-runner no volume da execução e devolve o texto do resultado. Espera
   * em fatias de `pollMs`, chamando `onProgress` com o log a cada uma. O container sai sempre.
   */
  async function runCommand(
    target: InfraTarget,
    command: 'plan' | 'apply',
    onProgress?: (log: string) => Promise<void>,
  ): Promise<
    { ok: true; text: string; log: string } | { ok: false; failure: InfraFailure; log: string }
  > {
    const timeoutMs = command === 'plan' ? timeouts.planMs : timeouts.applyMs;
    const file = command === 'plan' ? INFRA_PATHS.planResult : INFRA_PATHS.applyResult;
    let id: string | undefined;
    let log = '';
    let failed = true;
    const readLog = async () => {
      if (id === undefined) return;
      log = await runtime.logsTail(id, PROGRESS_LOG_LINES).catch((error: unknown) => {
        options.log?.(`Log do container ${id ?? ''} não lido: ${String(error)}`);
        return log;
      });
    };
    try {
      id = await runtime.start({
        name: `orakel-infra-${command}-${target.runId}`,
        image: options.image,
        command: [command],
        env: { ...options.env, SITE_ID: target.siteId, DOMAIN: target.domain },
        network: options.network,
        volume: { name: volumeOf(target), target: INFRA_DIR },
        labels: { ...labels(target), 'orakel.stage': `infra-${command}` },
      });
      const deadline = now() + timeoutMs;
      let waited: WaitResult;
      for (;;) {
        waited = await runtime.wait(id, Math.max(0, Math.min(timeouts.pollMs, deadline - now())));
        if (!('timedOut' in waited) || now() >= deadline) break;
        if (onProgress !== undefined) {
          await readLog();
          await onProgress(log);
        }
      }
      if ('timedOut' in waited) {
        await runtime.kill(id);
        await readLog();
        return {
          ok: false,
          failure: {
            kind: 'transient',
            message: `${command} passou de ${Math.round(timeoutMs / 60_000)} min e foi interrompido`,
          },
          log,
        };
      }
      await readLog();
      const text = await runtime.readFile(id, `${INFRA_DIR}/${file}`);
      if (text === undefined) {
        return {
          ok: false,
          failure: {
            kind: waited.exitCode === EXIT_CODES.permanent ? 'permanent' : 'transient',
            message: `${command} saiu com ${waited.exitCode} sem um ${file} válido`,
          },
          log,
        };
      }
      failed = false;
      return { ok: true, text, log };
    } catch (error) {
      return {
        ok: false,
        failure: { kind: 'transient', message: `${command}: ${message(error)}` },
        log,
      };
    } finally {
      if (id !== undefined) {
        const container = id;
        if (failed) {
          const tail = await readLogTail(runtime, container, options.log);
          if (tail !== undefined && tail !== '') {
            options.log?.(`Fim do log de ${container}:\n${tail}`);
          }
        }
        await runtime.removeContainer(container).catch((error: unknown) => {
          options.log?.(`Container ${container} não removido: ${String(error)}`);
        });
      }
    }
  }

  async function removeVolume(target: InfraTarget): Promise<void> {
    const volume = volumeOf(target);
    await runtime.removeVolume(volume).catch((error: unknown) => {
      options.log?.(`Volume ${volume} não removido: ${String(error)}`);
    });
  }

  function parse<T extends z.ZodType>(schema: T, text: string): z.infer<T> | undefined {
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  const noDomain = (target: InfraTarget): InfraFailure => ({
    kind: 'permanent',
    message: `O site ${target.siteId} não tem domínio na configuração`,
  });

  return {
    kind: 'tofu',

    async plan(target) {
      if (target.domain === '') return { status: 'failed', failure: noDomain(target) };
      const missing = await ensureImage();
      if (missing !== undefined) return { status: 'failed', failure: missing };
      let ok = false;
      try {
        await runtime.createVolume(volumeOf(target), labels(target));
        const run = await runCommand(target, 'plan');
        if (!run.ok) return { status: 'failed', failure: run.failure };
        const result = parse(InfraPlanResultSchema, run.text);
        if (result === undefined || result.site !== target.siteId) {
          return {
            status: 'failed',
            failure: {
              kind: 'transient',
              message: `${INFRA_PATHS.planResult} inválido ou de outro site`,
            },
          };
        }
        if (result.status === 'failed') return { status: 'failed', failure: result.failure };
        ok = true;
        return { status: 'ok', summary: summarizePlan(result.changes) };
      } catch (error) {
        return {
          status: 'failed',
          failure: { kind: 'transient', message: `plan: ${message(error)}` },
        };
      } finally {
        // O plano salvo fica no volume até o apply; sem plano, o volume não serve para nada.
        if (!ok) await removeVolume(target);
      }
    },

    async apply(target, onStep) {
      let reported: InfraStep | null = null;
      const advance = async (log: string) => {
        const { current } = readApplyProgress(log);
        if (current === null || (reported !== null && stepIndex(current) <= stepIndex(reported))) {
          return;
        }
        // Etapas puladas no log (sem recurso a criar) não são gravadas: só a mais adiantada.
        reported = current;
        await onStep(current);
      };
      try {
        if (target.domain === '')
          return { status: 'failed', step: null, failure: noDomain(target) };
        const missing = await ensureImage();
        if (missing !== undefined) return { status: 'failed', step: null, failure: missing };
        const run = await runCommand(target, 'apply', advance);
        await advance(run.log);
        const { errored } = readApplyProgress(run.log);
        const step = errored ?? reported;
        if (!run.ok) return { status: 'failed', step, failure: run.failure };
        const result = parse(InfraApplyResultSchema, run.text);
        if (result === undefined || result.site !== target.siteId) {
          return {
            status: 'failed',
            step,
            failure: {
              kind: 'transient',
              message: `${INFRA_PATHS.applyResult} inválido ou de outro site`,
            },
          };
        }
        if (result.status === 'failed') return { status: 'failed', step, failure: result.failure };
        if (result.status === 'destroyed') {
          return {
            status: 'failed',
            step,
            failure: {
              kind: 'transient',
              message: `${INFRA_PATHS.applyResult} relata destruição num apply`,
            },
          };
        }
        if (result.crawlerHints === 'falhou') {
          options.log?.(
            `Crawler Hints de ${target.siteId} não ligado pela API; ligue no painel (ADR 0027, passo 6)`,
          );
        }
        return { status: 'ok', nameservers: result.nameServers };
      } finally {
        await removeVolume(target);
      }
    },
  };
}

// --- local -------------------------------------------------------------------------------

export type LocalDriverOptions = {
  /** A primeira execução de cada site falha nesta etapa (INFRA_LOCAL_FAIL_STEP). */
  failStep?: InfraStep;
};

/** Recursos fictícios de cada etapa, nos tipos do módulo `site`. */
const LOCAL_RESOURCES: Record<InfraStep, { name: string; type: string }[]> = {
  endereco: [{ name: 'site', type: 'cloudflare_zone' }],
  dns: [
    { name: 'www', type: 'cloudflare_dns_record' },
    { name: 'spf', type: 'cloudflare_dns_record' },
    { name: 'dmarc', type: 'cloudflare_dns_record' },
  ],
  email: [
    { name: 'site', type: 'cloudflare_email_routing_settings' },
    { name: 'alias', type: 'cloudflare_email_routing_rule' },
    { name: 'site', type: 'cloudflare_email_routing_catch_all' },
  ],
  regras: [
    { name: 'always_use_https', type: 'cloudflare_zone_setting' },
    { name: 'waf', type: 'cloudflare_ruleset' },
    { name: 'site', type: 'cloudflare_tiered_cache' },
  ],
  imagens: [
    { name: 'media', type: 'cloudflare_r2_bucket' },
    { name: 'media', type: 'cloudflare_r2_custom_domain' },
  ],
};

export const LOCAL_NAMESERVERS = ['ada.ns.orakel.localhost', 'bob.ns.orakel.localhost'];

/**
 * Simulação sem rede: o "estado" de cada site é a memória do processo (as etapas já criadas),
 * então uma nova execução só cria o que faltou, como o OpenTofu faria. Reiniciar o build-runner
 * zera a memória; sem efeito fora do local e do E2E.
 */
export function localDriver(options: LocalDriverOptions = {}): InfraDriver {
  const created = new Map<string, Set<InfraStep>>();
  const failedOnce = new Set<string>();
  const createdOf = (siteId: string) => {
    const steps = created.get(siteId) ?? new Set<InfraStep>();
    created.set(siteId, steps);
    return steps;
  };

  return {
    kind: 'local',

    plan(target) {
      const done = createdOf(target.siteId);
      const changes = INFRA_STEPS.filter((step) => !done.has(step)).flatMap((step) =>
        LOCAL_RESOURCES[step].map(({ name, type }) => ({
          address: `module.site.${type}.${name}`,
          type,
          action: 'create' as const,
        })),
      );
      return Promise.resolve({ status: 'ok', summary: summarizePlan(changes) });
    },

    async apply(target, onStep) {
      const done = createdOf(target.siteId);
      for (const step of INFRA_STEPS) {
        if (done.has(step)) continue;
        await onStep(step);
        if (options.failStep === step && !failedOnce.has(target.siteId)) {
          failedOnce.add(target.siteId);
          return {
            status: 'failed',
            step,
            failure: {
              kind: 'permanent',
              message: `Falha simulada na etapa ${step} (driver local)`,
            },
          };
        }
        done.add(step);
      }
      return { status: 'ok', nameservers: [...LOCAL_NAMESERVERS] };
    },
  };
}
