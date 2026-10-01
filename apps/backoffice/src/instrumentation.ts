import type { Instrumentation } from 'next';

// Partida do processo web: janela dos builds (BUILD_WINDOW_SECONDS) e Sentry, ligado só com
// SENTRY_DSN (desligado no local e no CI).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ getEnv }, { configureBuildWindow }] = await Promise.all([
      import('./env.ts'),
      import('./domain/builds/schedule.ts'),
    ]);
    configureBuildWindow(getEnv().BUILD_WINDOW_SECONDS * 1000);
  }
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
