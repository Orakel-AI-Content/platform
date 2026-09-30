// Saída compactada do build: o artefato, o Worker empacotado (`wrangler deploy --dry-run`,
// o mesmo bundle que iria para a Cloudflare) e o wrangler.jsonc do alvo apontando para ele.
// Vai para o edge-local e para o bucket build-cache. Quem recebe não precisa do código-fonte.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { ARCHIVE_LAYOUT, PATHS } from '../contract.ts';
import { ClassifiedError } from '../failures.ts';
import { WRANGLER_BIN } from '../paths.ts';
import { parseJsonc } from '../wrangler/jsonc.ts';

const run = promisify(execFile);

export type Target = 'cloudflare' | 'local';

export function configFileOf(target: Target): string {
  return target === 'cloudflare' ? PATHS.wranglerCloudflare : PATHS.wranglerLocal;
}

export async function archiveBuild(buildDir: string, target: Target, file: string): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'orakel-archive-'));
  try {
    const configPath = join(buildDir, configFileOf(target));
    const workerDir = join(work, dirname(ARCHIVE_LAYOUT.worker));
    try {
      await run(
        WRANGLER_BIN,
        ['deploy', '--dry-run', '--config', configPath, '--outdir', workerDir],
        {
          env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    } catch (error) {
      const stderr = String((error as { stderr?: string }).stderr ?? error);
      throw new ClassifiedError(`Empacotar o Worker falhou: ${stderr.slice(-2000)}`, 'permanent');
    }
    const config = parseJsonc(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    await writeFile(
      join(work, ARCHIVE_LAYOUT.config),
      `${JSON.stringify({ ...config, main: `./${ARCHIVE_LAYOUT.worker}` }, null, 2)}\n`,
    );
    await run('tar', [
      '-czf',
      file,
      '-C',
      buildDir,
      ARCHIVE_LAYOUT.site,
      '-C',
      work,
      ARCHIVE_LAYOUT.worker,
      ARCHIVE_LAYOUT.config,
    ]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
