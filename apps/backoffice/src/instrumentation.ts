import type { Instrumentation } from 'next';

// Sentry no processo web, ligado só com SENTRY_DSN (desligado no local e no CI).
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
