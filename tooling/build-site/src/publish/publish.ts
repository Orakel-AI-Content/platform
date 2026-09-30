// publish (ADR 0005 da unidade): só roda depois de um render com sucesso; publica no alvo,
// guarda a saída compactada no build-cache e escreve publish.json — sempre, como o render.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CONTRACT_VERSION,
  PATHS,
  PublishResultSchema,
  ResultSchema,
  type PublishResult,
} from '../contract.ts';
import type { PublishEnv } from '../env.ts';
import { ClassifiedError, classify } from '../failures.ts';
import { archiveBuild, configFileOf, type Target } from './archive.ts';
import type { CacheConfig } from './build-cache.ts';
import { cacheKey } from './build-cache.ts';

export type PublishDeps = {
  archive: (buildDir: string, target: Target, file: string) => Promise<void>;
  deployCloudflare: (
    configPath: string,
    credentials: { apiToken: string; accountId: string },
  ) => Promise<string>;
  uploadEdgeLocal: (baseUrl: string, site: string, archive: string) => Promise<string>;
  uploadBuildCache: (config: CacheConfig, key: string, archive: string) => Promise<void>;
  now: () => number;
};

async function assertRendered(buildDir: string, site: string) {
  const text = await readFile(join(buildDir, PATHS.result), 'utf8').catch(() => undefined);
  const result = text === undefined ? undefined : ResultSchema.safeParse(JSON.parse(text));
  if (!result?.success || result.data.status !== 'ok' || result.data.site !== site) {
    throw new ClassifiedError(`Sem render com sucesso de ${site} em ${buildDir}`, 'permanent');
  }
}

export async function publish(env: PublishEnv, deps: PublishDeps): Promise<PublishResult> {
  const started = deps.now();
  const work = await mkdtemp(join(tmpdir(), 'orakel-publish-'));
  let result: PublishResult;
  try {
    await assertRendered(env.BUILD_DIR, env.SITE_ID);
    const archive = join(work, 'build.tar.gz');
    await deps.archive(env.BUILD_DIR, env.DEPLOY_TARGET, archive);

    const versionId =
      env.DEPLOY_TARGET === 'cloudflare'
        ? await deps.deployCloudflare(join(env.BUILD_DIR, configFileOf('cloudflare')), {
            apiToken: env.CLOUDFLARE_API_TOKEN,
            accountId: env.CLOUDFLARE_ACCOUNT_ID,
          })
        : await deps.uploadEdgeLocal(env.EDGE_LOCAL_URL, env.SITE_ID, archive);

    const key = cacheKey(env.SITE_ID, versionId);
    await deps.uploadBuildCache(
      {
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        bucket: env.BUILD_CACHE_BUCKET,
      },
      key,
      archive,
    );
    result = {
      formatVersion: CONTRACT_VERSION,
      status: 'ok',
      site: env.SITE_ID,
      target: env.DEPLOY_TARGET,
      versionId,
      cacheKey: key,
      durationMs: deps.now() - started,
    };
  } catch (error) {
    result = {
      formatVersion: CONTRACT_VERSION,
      status: 'failed',
      site: env.SITE_ID,
      failure: classify(error),
      durationMs: deps.now() - started,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  await writeFile(
    join(env.BUILD_DIR, PATHS.publish),
    `${JSON.stringify(PublishResultSchema.parse(result), null, 2)}\n`,
  );
  return result;
}

export { archiveBuild };
