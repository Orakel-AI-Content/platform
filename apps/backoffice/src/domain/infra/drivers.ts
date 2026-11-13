// Drivers da criação e da remoção da infraestrutura do site (INFRA_DRIVER, ADR 0027 da raiz),
// pelo tipo da execução (workspace#97). `tofu` roda o plano (na remoção, `INFRA_MODE=destroy`) e o
// apply no container do infra-runner, pelo ContainerRuntime: um volume próprio da
// execução guarda o plano salvo do `plan` ao `apply` e é apagado no fim do apply (ou na falha do
// plano); o container, sempre. O andamento vem do `-json` do tofu no log do container, lido em
// fatias durante a espera. `local` percorre as mesmas etapas sem rede nem segredos, com memória
// do que já "criou" e uma falha forçável, para o compose local e o E2E. A conferência
// (`check`, workspace#98) roda o mesmo `plan` num volume e container só dela, apagados sempre:
// o plano salvo é descartado e nada é aplicado.
import {
  EXIT_CODES,
  INFRA_DIR,
  INFRA_PATHS,
  InfraApplyResultSchema,
  InfraChangeSchema,
  InfraPlanResultSchema,
  type InfraChange,
  type InfraMode,
} from '@orakel/build-contract';
import * as z from 'zod';

import {
  INFRA_RESOURCE_STEPS,
  type InfraResourceStep,
  type InfraRunKind,
} from '../../db/schema/index.ts';
import {
  ImageUnavailableError,
  readLogTail,
  type ContainerRuntime,
  type WaitResult,
} from '../builds/runtime.ts';

/** O site e a execução de infra a que o plano e o apply pertencem; `kind`, o tipo dela. */
export type InfraTarget = { runId: number; siteId: string; domain: string; kind: InfraRunKind };

/**
 * Ordem das etapas no apply: a da criação, ou a inversa na remoção (o tofu destrói a zona por
 * último, depois do que depende dela).
 */
export function stepOrder(kind: InfraRunKind): readonly InfraResourceStep[] {
  return kind === 'criar' ? INFRA_RESOURCE_STEPS : [...INFRA_RESOURCE_STEPS].reverse();
}

const MODE_OF = { criar: 'create', remover: 'destroy' } as const satisfies Record<
  InfraRunKind,
  InfraMode
>;

/** O site cuja infra é conferida contra a descrição atual; não há execução em `infra_runs`. */
export type InfraCheckTarget = { siteId: string; domain: string };

/** Falha do plano ou do apply; não há repetição automática ("Tentar de novo" é outra execução). */
export type InfraFailure = { kind: 'permanent' | 'transient'; message: string };

/** Resumo do plano gravado em `infra_runs.planSummary`: os recursos que mudam, por etapa. */
export const InfraPlanSummarySchema = z.object({
  formatVersion: z.literal(1),
  steps: z.object(
    Object.fromEntries(
      INFRA_RESOURCE_STEPS.map((step) => [step, z.array(InfraChangeSchema)]),
    ) as Record<InfraResourceStep, z.ZodArray<typeof InfraChangeSchema>>,
  ),
});
export type InfraPlanSummary = z.infer<typeof InfraPlanSummarySchema>;

/** O plano muda algum recurso? Sem mudança, a infra está em dia com a descrição. */
export function planHasChanges(summary: InfraPlanSummary): boolean {
  return Object.values(summary.steps).some((changes) => changes.length > 0);
}

export type InfraPlanOutcome =
  { status: 'ok'; summary: InfraPlanSummary } | { status: 'failed'; failure: InfraFailure };

export type InfraApplyOutcome =
  /** `nameservers` da zona criada; vazio na remoção. */
  | { status: 'ok'; nameservers: string[] }
  /** `step`: a etapa em que o apply parou; nula quando nenhum recurso chegou a começar. */
  | { status: 'failed'; step: InfraResourceStep | null; failure: InfraFailure };

export interface InfraDriver {
  readonly kind: 'tofu' | 'local';
  plan(target: InfraTarget): Promise<InfraPlanOutcome>;
  /** `onStep` a cada etapa nova, na ordem de `stepOrder(target.kind)` (nunca volta). */
  apply(
    target: InfraTarget,
    onStep: (step: InfraResourceStep) => Promise<void>,
  ): Promise<InfraApplyOutcome>;
  /** Plano descartável contra a descrição atual: não guarda o plano nem toca a infra. */
  check(target: InfraCheckTarget): Promise<InfraPlanOutcome>;
}

/**
 * Etapa de um tipo de recurso do módulo `infra/modules/site`, nos termos de quem opera. O que
 * não é zona, DNS, e-mail nem armazenamento é regra da zona (rulesets, zone settings, cache,
 * bot management).
 */
export function stepOfResourceType(type: string): InfraResourceStep {
  if (type === 'cloudflare_zone') return 'endereco';
  if (type === 'cloudflare_dns_record') return 'dns';
  if (type.startsWith('cloudflare_email_routing')) return 'email';
  if (type.startsWith('cloudflare_r2')) return 'imagens';
  return 'regras';
}

/** Agrupa os recursos do plano por etapa; toda etapa aparece, vazia quando nada muda nela. */
export function summarizePlan(changes: readonly InfraChange[]): InfraPlanSummary {
  const steps = Object.fromEntries(
    INFRA_RESOURCE_STEPS.map((step) => [step, [] as InfraChange[]]),
  ) as Record<InfraResourceStep, InfraChange[]>;
  for (const change of changes) steps[stepOfResourceType(change.type)].push(change);
  return { formatVersion: 1, steps };
}

/** O que o log `-json` do apply diz até agora: a etapa mais adiantada e a do recurso que falhou. */
export type ApplyProgress = {
  current: InfraResourceStep | null;
  errored: InfraResourceStep | null;
};

/**
 * Lê as linhas `-json` do tofu: `apply_start` avança a etapa corrente (só para a frente, na ordem
 * do tipo: o tofu cria ou destrói recursos de etapas diferentes em paralelo) e `apply_errored`
 * aponta a etapa da falha. Linhas que não são JSON (avisos do entrypoint no stderr) são ignoradas.
 */
export function readApplyProgress(log: string, kind: InfraRunKind): ApplyProgress {
  const order = stepOrder(kind);
  const stepIndex = (step: InfraResourceStep) => order.indexOf(step);
  let current: InfraResourceStep | null = null;
  let errored: InfraResourceStep | null = null;
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
  /** Volume, nome do container e labels: da execução (`plan`/`apply`) ou da conferência. */
  type Slot = {
    siteId: string;
    domain: string;
    volume: string;
    container: (command: 'plan' | 'apply') => string;
    labels: Record<string, string>;
  };
  const runSlot = (target: InfraTarget): Slot => ({
    siteId: target.siteId,
    domain: target.domain,
    volume: `orakel-infra-${target.runId}`,
    container: (command) => `orakel-infra-${command}-${target.runId}`,
    labels: { 'orakel.infra': String(target.runId), 'orakel.site': target.siteId },
  });
  const checkSlot = (target: InfraCheckTarget): Slot => ({
    siteId: target.siteId,
    domain: target.domain,
    volume: `orakel-infra-check-${target.siteId}`,
    container: () => `orakel-infra-check-${target.siteId}`,
    labels: { 'orakel.infra-check': target.siteId, 'orakel.site': target.siteId },
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
    slot: Slot,
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
        name: slot.container(command),
        image: options.image,
        command: [command],
        env: { ...options.env, SITE_ID: slot.siteId, DOMAIN: slot.domain },
        network: options.network,
        volume: { name: slot.volume, target: INFRA_DIR },
        labels: { ...slot.labels, 'orakel.stage': `infra-${command}` },
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

  async function removeVolume(slot: Slot): Promise<void> {
    const { volume } = slot;
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

  const noDomain = (target: { siteId: string }): InfraFailure => ({
    kind: 'permanent',
    message: `O site ${target.siteId} não tem domínio na configuração`,
  });

  /**
   * Roda o `plan` no volume do slot e devolve o resumo. `keep`: o volume (com o plano salvo)
   * fica para o apply quando o plano sai bem; senão, é sempre apagado.
   */
  async function runPlan(slot: Slot, keep: boolean): Promise<InfraPlanOutcome> {
    if (slot.domain === '') return { status: 'failed', failure: noDomain(slot) };
    const missing = await ensureImage();
    if (missing !== undefined) return { status: 'failed', failure: missing };
    let ok = false;
    try {
      await runtime.createVolume(slot.volume, slot.labels);
      const run = await runCommand(slot, 'plan');
      if (!run.ok) return { status: 'failed', failure: run.failure };
      const result = parse(InfraPlanResultSchema, run.text);
      if (result === undefined || result.site !== slot.siteId) {
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
      if (!(keep && ok)) await removeVolume(slot);
    }
  }

  return {
    kind: 'tofu',

    plan(target) {
      // O plano salvo fica no volume até o apply; sem plano, o volume não serve para nada.
      return runPlan(runSlot(target), true);
    },

    check(target) {
      // Conferência: o plano salvo não serve para nada, o volume sai sempre.
      return runPlan(checkSlot(target), false);
    },

    async apply(target, onStep) {
      const order = stepOrder(target.kind);
      const stepIndex = (step: InfraResourceStep) => order.indexOf(step);
      let reported: InfraResourceStep | null = null;
      const advance = async (log: string) => {
        const { current } = readApplyProgress(log, target.kind);
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
        const run = await runCommand(runSlot(target), 'apply', advance);
        await advance(run.log);
        const { errored } = readApplyProgress(run.log, target.kind);
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
        if ((result.status === 'destroyed') !== (target.kind === 'remover')) {
          return {
            status: 'failed',
            step,
            failure: {
              kind: 'transient',
              message:
                result.status === 'destroyed'
                  ? `${INFRA_PATHS.applyResult} relata destruição num apply de criação`
                  : `${INFRA_PATHS.applyResult} relata criação num apply de remoção`,
            },
          };
        }
        if (result.status === 'destroyed') return { status: 'ok', nameservers: [] };
        if (result.crawlerHints === 'falhou') {
          options.log?.(
            `Crawler Hints de ${target.siteId} não ligado pela API; ligue no painel (ADR 0027, passo 6)`,
          );
        }
        return { status: 'ok', nameservers: result.nameServers };
      } finally {
        await removeVolume(runSlot(target));
      }
    },
  };
}

// --- local -------------------------------------------------------------------------------

export type LocalDriverOptions = {
  /**
   * A primeira execução de cada site e de cada tipo (criação, remoção) falha nesta etapa
   * (INFRA_LOCAL_FAIL_STEP).
   */
  failStep?: InfraResourceStep;
  /** A conferência destes sites sai desatualizada (INFRA_LOCAL_DRIFT_SITES); a dos outros, em dia. */
  driftSites?: readonly string[];
};

/** Recursos fictícios de cada etapa, nos tipos do módulo `site`. */
const LOCAL_RESOURCES: Record<InfraResourceStep, { name: string; type: string }[]> = {
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

/** Mudança que a conferência local devolve para um site configurado como desatualizado. */
export const LOCAL_DRIFT_CHANGE: InfraChange = {
  address: 'module.site.cloudflare_ruleset.waf',
  type: 'cloudflare_ruleset',
  action: 'update',
};

/**
 * Simulação sem rede: o "estado" de cada site é a memória do processo (as etapas já criadas),
 * então uma nova execução só cria o que faltou, como o OpenTofu faria. Reiniciar o build-runner
 * zera a memória; sem efeito fora do local e do E2E. A conferência não usa essa memória (ela
 * zeraria na partida e todo site sairia desatualizado): só `driftSites` sai desatualizado.
 */
export function localDriver(options: LocalDriverOptions = {}): InfraDriver {
  const created = new Map<string, Set<InfraResourceStep>>();
  const failedOnce = new Set<string>();
  const createdOf = ({ siteId, kind }: InfraTarget) => {
    const steps =
      created.get(siteId) ??
      new Set<InfraResourceStep>(kind === 'remover' ? INFRA_RESOURCE_STEPS : []);
    created.set(siteId, steps);
    return steps;
  };
  /** As etapas que a execução ainda tem a percorrer, na ordem do tipo. */
  const pending = (target: InfraTarget) => {
    const done = createdOf(target);
    return stepOrder(target.kind).filter((step) =>
      target.kind === 'criar' ? !done.has(step) : done.has(step),
    );
  };

  return {
    kind: 'local',

    plan(target) {
      const action = target.kind === 'criar' ? ('create' as const) : ('delete' as const);
      const changes = pending(target).flatMap((step) =>
        LOCAL_RESOURCES[step].map(({ name, type }) => ({
          address: `module.site.${type}.${name}`,
          type,
          action,
        })),
      );
      return Promise.resolve({ status: 'ok', summary: summarizePlan(changes) });
    },

    check(target) {
      const drifted = options.driftSites?.includes(target.siteId) ?? false;
      return Promise.resolve({
        status: 'ok',
        summary: summarizePlan(drifted ? [LOCAL_DRIFT_CHANGE] : []),
      });
    },

    async apply(target, onStep) {
      const done = createdOf(target);
      const once = `${target.siteId}:${target.kind}`;
      for (const step of pending(target)) {
        await onStep(step);
        if (options.failStep === step && !failedOnce.has(once)) {
          failedOnce.add(once);
          return {
            status: 'failed',
            step,
            failure: {
              kind: 'permanent',
              message: `Falha simulada na etapa ${step} (driver local)`,
            },
          };
        }
        if (target.kind === 'criar') done.add(step);
        else done.delete(step);
      }
      return {
        status: 'ok',
        nameservers: target.kind === 'criar' ? [...LOCAL_NAMESERVERS] : [],
      };
    },
  };
}
