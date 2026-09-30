// Artefatos de teste no formato do publish (ARCHIVE_LAYOUT): páginas, _headers, _redirects,
// 404, manifesto de eventos e o Worker real do apps/blog/worker empacotado pelo wrangler.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WORKER_MAIN = fileURLToPath(
  new URL('../../../../apps/blog/worker/src/index.ts', import.meta.url),
);
const WRANGLER = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));

let bundle: Promise<string> | undefined;

/** Worker do blog empacotado uma vez por execução dos testes. */
function workerBundle(): Promise<string> {
  bundle ??= (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'edge-bundle-'));
    const config = join(dir, 'wrangler.json');
    await writeFile(
      config,
      JSON.stringify({
        name: 'orakel-bundle',
        main: WORKER_MAIN,
        compatibility_date: '2026-09-22',
      }),
    );
    await run(WRANGLER, ['deploy', '--dry-run', '--config', config, '--outdir', join(dir, 'out')], {
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
    return readFile(join(dir, 'out', 'index.js'), 'utf8');
  })();
  return bundle;
}

export async function makeArchive(site: string, label: string, options: { name?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'edge-archive-'));
  const files: Record<string, string> = {
    'site/index.html': `<!doctype html><title>${label}</title><p>${label}</p>`,
    'site/artigo/index.html': `<p>artigo ${label}</p>`,
    'site/404.html': '<p>Página não encontrada</p>',
    'site/_astro/app.1a2b3c4d.css': 'body{}',
    'site/_headers':
      '/*\n  X-Robots-Tag: noindex\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n',
    'site/_redirects': '/antigo/ /artigo/ 301\n',
    'site/_data/events-manifest.json': JSON.stringify({
      formatVersion: 1,
      articles: [{ id: 1, path: '/artigo/' }],
    }),
    'worker/index.js': await workerBundle(),
    'wrangler.jsonc': JSON.stringify({
      name: options.name ?? `orakel-${site}`,
      main: './worker/index.js',
      compatibility_date: '2026-09-22',
      assets: {
        directory: './site',
        binding: 'ASSETS',
        run_worker_first: ['/_e/*'],
        html_handling: 'auto-trailing-slash',
        not_found_handling: '404-page',
      },
      services: [{ binding: 'EVENTS', service: 'ae-sim' }],
      vars: { SITE_ID: site, ALLOW_COUNTRY_OVERRIDE: 'true' },
    }),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  const file = join(dir, 'build.tar.gz');
  await run('tar', ['-czf', file, '-C', dir, 'site', 'worker', 'wrangler.jsonc']);
  const archive = await readFile(file);
  await rm(dir, { recursive: true, force: true });
  return archive;
}

/** Apaga uma pasta de teste; as versões ficam sem escrita, como no Store. */
export async function removeTree(dir: string): Promise<void> {
  await run('chmod', ['-R', 'u+w', dir]).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
}
