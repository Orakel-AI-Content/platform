import type { Instrumentation } from 'next';

// Partida do processo web: janela dos builds (BUILD_WINDOW_SECONDS), limite diário de
// publicações (PUBLISH_DAILY_LIMIT) e Sentry, ligado só com SENTRY_DSN (desligado no local e
// no CI).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ getEnv }, { configureBuildWindow }, { configureDailyPublishLimit }] =
      await Promise.all([
        import('./env.ts'),
        import('./domain/builds/schedule.ts'),
        import('./domain/publications/publish.ts'),
      ]);
    const env = getEnv();
    configureBuildWindow(env.BUILD_WINDOW_SECONDS * 1000);
    configureDailyPublishLimit(env.PUBLISH_DAILY_LIMIT);
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
