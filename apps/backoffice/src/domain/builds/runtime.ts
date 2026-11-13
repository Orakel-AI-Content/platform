// O que o build precisa do runtime de containers (12.0, L3). Implementado sobre a API do
// Docker pelo docker-socket-proxy (src/lib/docker.ts) e por um runtime falso nos testes.
// Cada operação corresponde a uma rota liberada no proxy (ADR 0011 da raiz).

export type ContainerSpec = {
  name: string;
  image: string;
  command: string[];
  env: Record<string, string>;
  /** Rede única do container: export (render) ou publish (publish). */
  network: string;
  volume: { name: string; target: string };
  /** CPU e memória (render); prioridade baixa frente aos serviços da VPS. */
  limits?: { cpus: number; memoryBytes: number; cpuShares: number };
  labels: Record<string, string>;
};

/**
 * Container de serviço, de longa duração (a prévia, ADR 0024 da raiz): várias redes com apelido,
 * healthcheck e restart `unless-stopped`; sem volume e sem limites de render.
 */
export type ServiceSpec = {
  name: string;
  /** Só `SITE_BUILDER_IMAGE:<tag>`. */
  image: string;
  command: string[];
  env: Record<string, string>;
  /** A primeira é a rede principal; todas entram no create (API ≥ 1.44). */
  networks: { name: string; aliases: string[] }[];
  healthcheck: { test: string[]; intervalMs: number; timeoutMs: number; retries: number };
  labels: Record<string, string>;
};

/** Saúde pelo healthcheck; `absent` quando o container não existe. Parado conta como `unhealthy`. */
export type ServiceHealth = 'starting' | 'healthy' | 'unhealthy' | 'absent';

export type WaitResult = { exitCode: number } | { timedOut: true };

export interface ContainerRuntime {
  /** A imagem já está no host? */
  imageExists(image: string): Promise<boolean>;
  /**
   * Baixa a imagem do registry (sem credencial: o pacote é público). Só aceita
   * `SITE_BUILDER_IMAGE:<tag>` ou `INFRA_RUNNER_IMAGE:<tag>`; o proxy libera a rota, mas não
   * enxerga o nome (ADR 0021 da raiz).
   */
  pullImage(image: string): Promise<void>;
  /**
   * Dá a `target` a imagem que já está em `source`, no host (driver local da release, ADR 0023
   * da raiz). Os dois são `SITE_BUILDER_IMAGE:<tag>`; a rota só é liberada no proxy do local.
   */
  tagImage(source: string, target: string): Promise<void>;
  createVolume(name: string, labels: Record<string, string>): Promise<void>;
  /**
   * Cria e inicia; devolve o ID do container. Só aceita `SITE_BUILDER_IMAGE:<tag>` (render,
   * publish) ou `INFRA_RUNNER_IMAGE:<tag>` (plano e apply da infra do site).
   */
  start(spec: ContainerSpec): Promise<string>;
  /**
   * Cria e inicia um container de serviço; devolve o ID. Só aceita `SITE_BUILDER_IMAGE:<tag>`.
   * Para e remove pelo `kill` e pelo `removeContainer`.
   */
  startService(spec: ServiceSpec): Promise<string>;
  /** Estado de saúde atual do container (leitura pontual, sem esperar). */
  health(id: string): Promise<ServiceHealth>;
  /** Espera o container terminar, até o limite. */
  wait(id: string, timeoutMs: number): Promise<WaitResult>;
  kill(id: string): Promise<void>;
  /** Lê um arquivo do container (ou do volume montado nele); `undefined` se não existir. */
  readFile(id: string, path: string): Promise<string | undefined>;
  /** Últimas `lines` linhas do log do container (stdout e stderr), em texto. */
  logsTail(id: string, lines: number): Promise<string>;
  /** Remove sem erro se já não existir. */
  removeContainer(id: string): Promise<void>;
  removeVolume(name: string): Promise<void>;
}

/** Limite do trecho final do log guardado na falha: linhas pedidas ao Docker e bytes gravados. */
export const LOG_TAIL_LIMITS = { lines: 200, bytes: 16 * 1024 } as const;

/**
 * Fim do log do container, no limite de `LOG_TAIL_LIMITS`, para guardar com a falha. Lido antes
 * de o container ser removido. Melhor esforço: erro de leitura só vai para o `log` e devolve
 * `undefined`, sem mudar o resultado da execução.
 */
export async function readLogTail(
  runtime: ContainerRuntime,
  id: string,
  log?: (msg: string) => void,
): Promise<string | undefined> {
  try {
    const text = await runtime.logsTail(id, LOG_TAIL_LIMITS.lines);
    const bytes = new TextEncoder().encode(text);
    if (bytes.length <= LOG_TAIL_LIMITS.bytes) return text;
    // Corta pelo começo; um caractere partido no corte vira U+FFFD e sai.
    return new TextDecoder()
      .decode(bytes.subarray(bytes.length - LOG_TAIL_LIMITS.bytes))
      .replace(/^\uFFFD+/, '');
  } catch (error) {
    log?.(`Log do container ${id} não lido: ${String(error)}`);
    return undefined;
  }
}

/** Erro do runtime (rede, proxy, daemon): o build é repetido. */
export class RuntimeError extends Error {
  override readonly name = 'RuntimeError';
  readonly kind = 'transient';
}

/**
 * O registry recusou o pull porque a imagem não existe ou o acesso foi negado (`denied`,
 * `manifest unknown`, `not found`, `unauthorized`): repetir não a traz, a falha é permanente.
 */
export class ImageUnavailableError extends Error {
  override readonly name = 'ImageUnavailableError';
  readonly kind = 'permanent';
}
