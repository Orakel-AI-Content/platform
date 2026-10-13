import type { JobHelpers } from 'graphile-worker';

/**
 * Esta execução é a última que o Graphile Worker fará do job (#185): se falhar, o job não
 * volta. É quando o envio de mídia precisa ser fechado como recusado.
 */
export function isLastAttempt(helpers: JobHelpers): boolean {
  return helpers.job.attempts >= helpers.job.max_attempts;
}
