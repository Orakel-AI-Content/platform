// rollback (ADR 0009 da unidade): ativa no alvo uma versão já publicada (o `versionId` do
// publish.json) e escreve rollback.json — sempre, como o render e o publish. Não depende de
// render no volume nem toca no build-cache.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CONTRACT_VERSION,
  PATHS,
  RollbackResultSchema,
  type Failure,
  type RollbackResult,
} from '@orakel/build-contract';
import type { RollbackEnv } from './env.ts';
import { classify } from './failures.ts';

export type RollbackDeps = {
  rollbackCloudflare: (
    site: string,
    versionId: string,
    credentials: { apiToken: string; accountId: string },
  ) => Promise<string>;
  rollbackEdgeLocal: (baseUrl: string, site: string, versionId: string) => Promise<string>;
  now: () => number;
};

export async function writeRollbackResult(buildDir: string, result: RollbackResult) {
  await writeFile(
    join(buildDir, PATHS.rollback),
    `${JSON.stringify(RollbackResultSchema.parse(result), null, 2)}\n`,
  );
}

export function rollbackFailure(site: string, failure: Failure, durationMs = 0): RollbackResult {
  return { formatVersion: CONTRACT_VERSION, status: 'failed', site, failure, durationMs };
}

export async function rollback(env: RollbackEnv, deps: RollbackDeps): Promise<RollbackResult> {
  const started = deps.now();
  let result: RollbackResult;
  try {
    const versionId =
      env.DEPLOY_TARGET === 'cloudflare'
        ? await deps.rollbackCloudflare(env.SITE_ID, env.VERSION_ID, {
            apiToken: env.CLOUDFLARE_API_TOKEN,
            accountId: env.CLOUDFLARE_ACCOUNT_ID,
          })
        : await deps.rollbackEdgeLocal(env.EDGE_LOCAL_URL, env.SITE_ID, env.VERSION_ID);
    result = {
      formatVersion: CONTRACT_VERSION,
      status: 'ok',
      site: env.SITE_ID,
      target: env.DEPLOY_TARGET,
      versionId,
      durationMs: deps.now() - started,
    };
  } catch (error) {
    result = rollbackFailure(env.SITE_ID, classify(error), deps.now() - started);
  }
  await writeRollbackResult(env.BUILD_DIR, result);
  return result;
}
