// render (ADR 0002 da unidade): astro build do blog com o snapshot da API → /build/site,
// trava de segurança, wrangler.jsonc dos dois alvos e result.json — sempre escrito, com
// sucesso ou falha. Sem segredo além do token do build; nunca toca o deploy.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { CONTRACT_VERSION, PATHS, ResultSchema, type Result } from '@orakel/build-contract';
import type { RenderEnv } from '../env.ts';
import { ClassifiedError, classify } from '../failures.ts';
import {
  cloudflareConfig,
  localConfig,
  readBaseConfig,
  renderConfig,
} from '../wrangler/targets.ts';
import { countArtifact } from './count.ts';
import { checkPageDrop } from './page-drop.ts';

export type BuildSite = (options: { outDir: string; env: Record<string, string> }) => Promise<void>;

export type RenderDeps = {
  buildSite: BuildSite;
  baseConfigText: () => Promise<string>;
  workerMain: string;
  now: () => number;
};

/** O que o blog grava no metaFile: header e end do snapshot (content-client) + uso de redirects. */
const MetaSchema = z.object({
  header: z.object({ pendingChangeIds: z.array(z.number().int().positive()) }),
  redirectUsage: z.object({
    static: z.number().int(),
    dynamic: z.number().int(),
    limits: z.object({ static: z.number().int(), dynamic: z.number().int() }),
    alert: z.boolean(),
  }),
});

async function readMeta(file: string) {
  const parsed = MetaSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!parsed.success) {
    throw new ClassifiedError(`metaFile do blog incompleto: ${parsed.error.message}`, 'permanent');
  }
  return parsed.data;
}

export async function writeResult(buildDir: string, result: Result): Promise<void> {
  await mkdir(buildDir, { recursive: true });
  await writeFile(
    join(buildDir, PATHS.result),
    `${JSON.stringify(ResultSchema.parse(result), null, 2)}\n`,
  );
}

export async function render(env: RenderEnv, deps: RenderDeps): Promise<Result> {
  const started = deps.now();
  const base = {
    formatVersion: CONTRACT_VERSION,
    site: env.SITE_ID,
    release: env.RELEASE,
  } as const;
  const out = (path: string) => join(env.BUILD_DIR, path);
  const metaFile = join(tmpdir(), `orakel-snapshot-meta-${process.pid}-${started}.json`);
  // O Astro move arquivos com rename, que não atravessa dispositivos: o build sai numa
  // pasta do próprio container e só depois é copiado para o volume.
  const stage = await mkdtemp(join(tmpdir(), 'orakel-site-'));

  let result: Result;
  try {
    await rm(out(PATHS.site), { recursive: true, force: true });
    await mkdir(env.BUILD_DIR, { recursive: true });
    await deps.buildSite({
      outDir: stage,
      env: {
        SITE_ID: env.SITE_ID,
        CONTENT_SOURCE: 'api',
        EXPORT_API_URL: env.EXPORT_API_URL,
        EXPORT_BUILD_TOKEN: env.EXPORT_BUILD_TOKEN,
        SNAPSHOT_META_FILE: metaFile,
      },
    });
    const meta = await readMeta(metaFile);
    const counts = await countArtifact(stage);
    checkPageDrop({
      pages: counts.pages,
      activePages: env.ACTIVE_PAGE_COUNT,
      tolerance: env.PAGE_DROP_TOLERANCE,
      allowMassUnpublish: env.ALLOW_MASS_UNPUBLISH === 'true',
    });

    await cp(stage, out(PATHS.site), { recursive: true });

    const baseConfig = readBaseConfig(await deps.baseConfigText());
    const target = {
      site: env.SITE_ID,
      domain: env.SITE_DOMAIN,
      workerMain: deps.workerMain,
      assetsDir: `./${PATHS.site}`,
    };
    await writeFile(
      out(PATHS.wranglerCloudflare),
      renderConfig(cloudflareConfig(baseConfig, target), 'cloudflare'),
    );
    await writeFile(
      out(PATHS.wranglerLocal),
      renderConfig(localConfig(baseConfig, target), 'local'),
    );

    result = {
      ...base,
      status: 'ok',
      pendingChangeIds: meta.header.pendingChangeIds,
      pages: counts.pages,
      files: counts.files,
      redirectUsage: meta.redirectUsage,
      durationMs: deps.now() - started,
    };
  } catch (error) {
    result = {
      ...base,
      status: 'failed',
      failure: classify(error),
      durationMs: deps.now() - started,
    };
  } finally {
    await rm(metaFile, { force: true });
    await rm(stage, { recursive: true, force: true });
  }
  await writeResult(env.BUILD_DIR, result);
  return result;
}
