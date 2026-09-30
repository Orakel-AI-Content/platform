import * as Sentry from '@sentry/node';

/** Rastreio de erros nos processos Node (worker, build-runner). Desligado sem SENTRY_DSN. */
export function initSentry(service: string, dsn: string | undefined): void {
  if (!dsn) return;
  Sentry.init({ dsn, serverName: service, tracesSampleRate: 0 });
}
