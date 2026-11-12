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

export type WaitResult = { exitCode: number } | { timedOut: true };

export interface ContainerRuntime {
  /** A imagem já está no host? O proxy recusa pull: a imagem chega pela promoção/deploy. */
  imageExists(image: string): Promise<boolean>;
  createVolume(name: string, labels: Record<string, string>): Promise<void>;
  /** Cria e inicia; devolve o ID do container. */
  start(spec: ContainerSpec): Promise<string>;
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
