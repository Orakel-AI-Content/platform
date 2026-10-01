import { configureBuildWindow } from '../domain/builds/schedule.ts';
import { getEnv } from '../env.ts';
import { createLogger, type Logger } from '../lib/logger.ts';
import { initSentry } from '../lib/sentry.ts';

/** Partida comum dos processos Node: valida o ambiente, liga o Sentry e loga a falha fatal. */
export async function runProcess(
  service: string,
  main: (logger: Logger) => Promise<void>,
): Promise<void> {
  const logger = createLogger(service);
  try {
    const env = getEnv();
    initSentry(service, env.SENTRY_DSN);
    configureBuildWindow(env.BUILD_WINDOW_SECONDS * 1000);
    await main(logger);
  } catch (error) {
    logger.fatal({ err: error }, `${service} falhou`);
    process.exitCode = 1;
  }
}
