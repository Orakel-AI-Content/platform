// Fim do build estático (ADR 0005 da unidade): grava os arquivos da borda e o manifesto de
// eventos (trazidos por /orakel-edge.json, gerado com a mesma leitura do snapshot), copia as
// fontes do tema, gera o índice do Pagefind, confere o orçamento de JS e acrescenta o uso de
// redirects ao metaFile do render.
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { AstroIntegration, AstroIntegrationLogger } from 'astro';

import { measureBudgets } from '../checks/js-budget.ts';
import { BuildError } from '../data/errors.ts';
import type { EdgeBundle } from '../pages/orakel-edge.json.ts';

export const EDGE_BUNDLE = 'orakel-edge.json';

const require = createRequire(import.meta.url);

async function writeAt(dir: string, path: string, content: string | Uint8Array) {
  const target = join(dir, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

/**
 * Índice do Pagefind pela CLI, num processo filho: quando o processo termina, todos os
 * arquivos estão gravados. A API Node (`writeFiles` + `close`) às vezes encerrava o
 * processo do Pagefind antes do fim da escrita, e o build deixava de ser idempotente.
 */
async function indexSearch(dir: string, logger: AstroIntegrationLogger) {
  // O pacote só exporta a API ESM; a CLI fica no node_modules do app (layout do workspace).
  const cli = fileURLToPath(
    new URL('../../node_modules/pagefind/lib/runner/bin.cjs', import.meta.url),
  );
  try {
    await promisify(execFile)(process.execPath, [cli, '--site', dir, '--silent']);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? String(error);
    throw new BuildError(`Pagefind: ${stderr.trim()}`, 'permanent');
  }
  logger.info('Pagefind: índice gerado');
}

export async function finishSite(dir: string, logger: AstroIntegrationLogger): Promise<void> {
  const bundlePath = join(dir, EDGE_BUNDLE);
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as EdgeBundle;
  await rm(bundlePath);

  for (const file of bundle.files) await writeAt(dir, file.path, file.content);
  for (const font of bundle.fonts) {
    const target = join(dir, font.url);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(require.resolve(`@orakel/tokens/fonts/${font.file}`), target);
  }
  logger.info(`${bundle.files.length} arquivos da borda e ${bundle.fonts.length} fontes`);

  if (bundle.search) await indexSearch(dir, logger);

  const { results, problems } = await measureBudgets(dir);
  const worst = [...results].sort((a, b) => b.kb / b.limit - a.kb / a.limit)[0];
  if (worst)
    logger.info(
      `Orçamento de JS: maior uso ${worst.kb.toFixed(1)}/${worst.limit} kB (${worst.page})`,
    );
  if (problems.length > 0) {
    throw new BuildError(`Orçamento de JS: ${problems.join('; ')}`, 'permanent');
  }

  const metaFile = process.env.SNAPSHOT_META_FILE;
  if (metaFile) {
    const meta = JSON.parse(await readFile(metaFile, 'utf8')) as Record<string, unknown>;
    await writeFile(metaFile, JSON.stringify({ ...meta, redirectUsage: bundle.redirectUsage }));
  }
}

export function siteFiles(): AstroIntegration {
  return {
    name: 'orakel-site-files',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => finishSite(fileURLToPath(dir), logger),
    },
  };
}
