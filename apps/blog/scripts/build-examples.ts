// Sites de exemplo para o CI (axe e paridade): exemplo-a e exemplo-b a partir das fixtures
// do content-model, cada um construído duas vezes para provar a idempotência (mesmos
// arquivos, mesmos bytes), mais o build da visualização (SSR).
//
//   pnpm build:examples   →   dist-examples/{exemplo-a,exemplo-b,preview}
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

export const EXAMPLE_SITES = ['exemplo-a', 'exemplo-b'] as const;
const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist-examples');

function astroBuild(outDir: string, env: Record<string, string>) {
  execFileSync('astro', ['build', '--outDir', outDir], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, CONTENT_SOURCE: 'fixture', ...env },
  });
}

/** Hash de cada arquivo, por caminho relativo. */
export function fingerprint(dir: string): Map<string, string> {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  return new Map(
    files
      .map((file): [string, string] => [
        relative(dir, file),
        createHash('sha256').update(readFileSync(file)).digest('hex'),
      ])
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

export function differences(a: Map<string, string>, b: Map<string, string>): string[] {
  const paths = new Set([...a.keys(), ...b.keys()]);
  return [...paths].filter((path) => a.get(path) !== b.get(path)).sort();
}

if (import.meta.main) {
  rmSync(out, { recursive: true, force: true });
  for (const site of EXAMPLE_SITES) {
    const target = join(out, site);
    const again = mkdtempSync(join(tmpdir(), `orakel-${site}-`));
    try {
      astroBuild(target, { SITE_ID: site });
      astroBuild(again, { SITE_ID: site });
      const diff = differences(fingerprint(target), fingerprint(again));
      if (diff.length > 0) {
        console.error(`${site}: dois builds do mesmo snapshot diferem em ${diff.join(', ')}`);
        process.exit(1);
      }
      console.log(`${site}: ${fingerprint(target).size} arquivos, idempotente`);
    } finally {
      rmSync(again, { recursive: true, force: true });
    }
  }
  astroBuild(join(out, 'preview'), { BLOG_OUTPUT: 'preview' });
  console.log('preview: SSR construído');
}
