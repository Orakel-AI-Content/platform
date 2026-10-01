// Medições da L3: duração do render (p50, p90), páginas, arquivos e tamanho do artefato com
// 100, 1.000 e 5.000 artigos sintéticos. Roda o render de verdade (CLI, processo separado),
// contra o snapshot-server. Manual, fora do CI: o resultado depende da máquina.
//
//   pnpm --filter @orakel/build-site measure [-- 100,1000,5000 [repetições]]
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { ResultSchema } from '@orakel/build-contract';
import { SMOKE_TOKEN, startSnapshotServer } from './snapshot-server.ts';
import { syntheticSnapshot } from './synthetic-snapshot.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const run = promisify(execFile);

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function sizeMb(dir: string): Promise<number> {
  const { stdout } = await run('du', ['-sk', dir]);
  return Number(stdout.split('\t')[0]) / 1024;
}

const [sizesArg = '100,1000,5000', repeatsArg = '3'] = process.argv.slice(2);
const sizes = sizesArg.split(',').map(Number);
const repeats = Number(repeatsArg);
const work = mkdtempSync(join(tmpdir(), 'orakel-measure-'));
const port = 8190;

const rows: string[] = [];
try {
  for (const articles of sizes) {
    const file = join(work, `sintetico-${articles}.ndjson`);
    writeFileSync(file, syntheticSnapshot(articles));
    const server = startSnapshotServer(port, { 'exemplo-a': file });
    const durations: number[] = [];
    let last: { pages: number; files: number; mb: number } | undefined;
    for (let i = 0; i < repeats; i += 1) {
      const buildDir = join(work, `build-${articles}-${i}`);
      const started = Date.now();
      await run(process.execPath, [cli, 'render'], {
        env: {
          ...process.env,
          SITE_ID: 'exemplo-a',
          SITE_DOMAIN: 'exemplo-a.com.br',
          EXPORT_API_URL: `http://127.0.0.1:${port}`,
          EXPORT_BUILD_TOKEN: SMOKE_TOKEN,
          RELEASE: 'medicao',
          BUILD_DIR: buildDir,
        },
        maxBuffer: 64 * 1024 * 1024,
      });
      durations.push((Date.now() - started) / 1000);
      const result = ResultSchema.parse(
        JSON.parse(readFileSync(join(buildDir, 'result.json'), 'utf8')),
      );
      if (result.status !== 'ok') throw new Error(`render falhou: ${result.failure.message}`);
      last = { pages: result.pages, files: result.files, mb: await sizeMb(join(buildDir, 'site')) };
      rmSync(buildDir, { recursive: true, force: true });
      console.error(`${articles} artigos, rodada ${i + 1}: ${durations.at(-1)!.toFixed(1)} s`);
    }
    server.close();
    rows.push(
      `| ${articles.toLocaleString('pt-BR')} | ${percentile(durations, 50).toFixed(1)} s | ${percentile(durations, 90).toFixed(1)} s | ${last!.pages.toLocaleString('pt-BR')} | ${last!.files.toLocaleString('pt-BR')} | ${last!.mb.toFixed(1)} MB |`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `Máquina: ${cpus()[0]?.model ?? '?'} × ${cpus().length}, ${Math.round(totalmem() / 2 ** 30)} GB; Node ${process.version}; ${repeats} rodadas por tamanho.\n`,
);
console.log('| Artigos | p50 | p90 | Páginas | Arquivos | Artefato |');
console.log('|---|---|---|---|---|---|');
for (const row of rows) console.log(row);
