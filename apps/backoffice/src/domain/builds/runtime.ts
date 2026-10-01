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
  /** Remove sem erro se já não existir. */
  removeContainer(id: string): Promise<void>;
  removeVolume(name: string): Promise<void>;
}

/** Erro do runtime (rede, proxy, daemon): o build é repetido. */
export class RuntimeError extends Error {
  override readonly name = 'RuntimeError';
  readonly kind = 'transient';
}
