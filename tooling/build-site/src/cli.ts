// Entrypoint da imagem site-builder: node tooling/build-site/src/cli.ts <render|publish|ssr>
// O código de saída segue o contrato: 0 sucesso, 10 permanente, 20 transitória.
import { readFile } from 'node:fs/promises';

import { CONTRACT_VERSION, EXIT_CODES, exitCodeOf } from './contract.ts';
import { PublishEnvSchema, RenderEnvSchema, parseEnv } from './env.ts';
import { classify } from './failures.ts';
import { WORKER_BASE_CONFIG, WORKER_MAIN } from './paths.ts';
import { publish } from './publish/publish.ts';
import { archiveBuild } from './publish/archive.ts';
import { uploadBuildCache } from './publish/build-cache.ts';
import { deployCloudflare } from './publish/cloudflare.ts';
import { uploadEdgeLocal } from './publish/edge-local.ts';
import { astroBuild } from './render/astro-build.ts';
import { render, writeResult } from './render/render.ts';
import { ssr } from './ssr.ts';

const log = (message: Record<string, unknown>) => console.log(JSON.stringify(message));

async function runRender(): Promise<number> {
  let env;
  try {
    env = parseEnv(RenderEnvSchema, process.env, 'render');
  } catch (error) {
    // Sem variáveis válidas ainda dá para registrar o motivo, se o volume existir.
    const failure = classify(error);
    await writeResult(process.env.BUILD_DIR ?? '/build', {
      formatVersion: CONTRACT_VERSION,
      site: process.env.SITE_ID || 'desconhecido',
      release: process.env.RELEASE || 'local',
      status: 'failed',
      failure,
      durationMs: 0,
    }).catch(() => undefined);
    log({ msg: 'render falhou', ...failure });
    return EXIT_CODES[failure.kind];
  }
  const result = await render(env, {
    buildSite: astroBuild,
    baseConfigText: () => readFile(WORKER_BASE_CONFIG, 'utf8'),
    workerMain: WORKER_MAIN,
    now: Date.now,
  });
  log(
    result.status === 'ok'
      ? {
          msg: 'render ok',
          site: result.site,
          pages: result.pages,
          files: result.files,
          durationMs: result.durationMs,
        }
      : { msg: 'render falhou', site: result.site, ...result.failure },
  );
  return exitCodeOf(result);
}

async function runPublish(): Promise<number> {
  let env;
  try {
    env = parseEnv(PublishEnvSchema, process.env, 'publish');
  } catch (error) {
    const failure = classify(error);
    log({ msg: 'publish falhou', ...failure });
    return EXIT_CODES[failure.kind];
  }
  const result = await publish(env, {
    archive: archiveBuild,
    deployCloudflare,
    uploadEdgeLocal,
    uploadBuildCache,
    now: Date.now,
  });
  log(
    result.status === 'ok'
      ? { msg: 'publish ok', site: result.site, target: result.target, versionId: result.versionId }
      : { msg: 'publish falhou', site: result.site, ...result.failure },
  );
  return exitCodeOf(result);
}

const [command] = process.argv.slice(2);
try {
  switch (command) {
    case 'render':
      process.exitCode = await runRender();
      break;
    case 'publish':
      process.exitCode = await runPublish();
      break;
    case 'ssr':
      process.exitCode = await ssr();
      break;
    default:
      console.error('Uso: node tooling/build-site/src/cli.ts <render|publish|ssr>');
      process.exitCode = 2;
  }
} catch (error) {
  // Falha fora do esperado (ex.: volume sem permissão): transitória, pelo contrato.
  log({ msg: `${command} falhou`, ...classify(error) });
  process.exitCode = EXIT_CODES.transient;
}
