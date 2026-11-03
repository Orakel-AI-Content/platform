/**
 * Valores que a partida do processo aplica ao domínio (janela dos builds e limite diário de
 * publicações), vindos do ambiente em `runProcess` e no `instrumentation` do Next; o domínio não
 * lê o ambiente. Ficam no `globalThis`, não numa variável de módulo: no build do Next, o
 * `instrumentation` e as Server Actions vão para chunks diferentes, cada um com a sua cópia dos
 * módulos do domínio, e a cópia das actions nunca seria configurada (ficaria no padrão de
 * produção). A chave é um `Symbol.for`, a mesma em todas as cópias.
 */
export type ProcessSettings = {
  /** Janela de agrupamento padrão dos builds (BUILD_WINDOW_SECONDS): 15 min em produção. */
  buildWindowMs: number;
  /** Limite diário padrão de publicações por site (PUBLISH_DAILY_LIMIT). */
  dailyPublishLimit: number;
};

const KEY = Symbol.for('orakel.backoffice.process-settings');

/** Os valores do processo, criados com os padrões no primeiro acesso de qualquer cópia. */
export function processSettings(): ProcessSettings {
  const store = globalThis as unknown as Record<symbol, ProcessSettings | undefined>;
  return (store[KEY] ??= { buildWindowMs: 15 * 60_000, dailyPublishLimit: 3 });
}
