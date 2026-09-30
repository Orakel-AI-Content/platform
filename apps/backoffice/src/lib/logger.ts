import pino from 'pino';

// Logs em JSON, um objeto por linha, com `msg` e contexto (siteId, jobId…). Nunca logue
// segredos nem dados de visitantes (convenção da raiz).
export function createLogger(service: string) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    redact: ['authorization', '*.authorization', 'token', '*.token'],
  });
}

export type Logger = ReturnType<typeof createLogger>;
