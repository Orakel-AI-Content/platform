import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { importsOf, measureBudgets, scriptsOf } from './js-budget.ts';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function site(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orakel-budget-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

// Conteúdo pouco compressível, para testar limites em kB gzip.
const noise = (kb: number) =>
  Array.from({ length: kb * 200 }, (_, i) => ((i * 2654435761) % 4294967296).toString(36)).join('');

describe('scriptsOf e importsOf', () => {
  it('separa externos e inline, ignora JSON-LD e pega modulepreload', () => {
    const html = `<html lang="pt-BR" data-page-type="artigo"><head>
      <script type="application/ld+json">{"a":1}</script>
      <script>gtag()</script>
      <link rel="modulepreload" href="/_astro/b.js">
      </head><body><script type="module" src="/_astro/a.js"></script></body></html>`;
    expect(scriptsOf(html)).toEqual({
      pageType: 'artigo',
      inline: ['gtag()'],
      external: ['/_astro/a.js', '/_astro/b.js'],
    });
  });

  it('segue imports estáticos e dinâmicos relativos', () => {
    expect(importsOf('import{a}from"./x.js";import("./y.js");import "lib"')).toEqual([
      './x.js',
      './y.js',
    ]);
  });
});

describe('measureBudgets', () => {
  it('soma chunks importados e aponta estouro, página sem tipo e script ausente', async () => {
    const dir = await site({
      'index.html': '<html data-page-type="home"><script src="/_astro/a.js"></script></html>',
      'x/index.html': `<html data-page-type="artigo"><script>${noise(20)}</script></html>`,
      'y/index.html': '<html><body></body></html>',
      'z/index.html':
        '<html data-page-type="artigo"><script src="/_astro/sumiu.js"></script></html>',
      '_astro/a.js': 'import"./b.js";',
      '_astro/b.js': 'console.log(1)',
    });
    const { results, problems } = await measureBudgets(dir);
    expect(results.find((result) => result.page === '/index.html')?.kb).toBeLessThan(1);
    expect(problems).toEqual([
      expect.stringMatching(/^\/x\/index\.html \(artigo\): \d+\.\d kB de JS, limite 15 kB$/),
      '/y/index.html: sem data-page-type',
      'script ausente no build: _astro/sumiu.js',
    ]);
  });

  it('na busca, soma a API, o worker e o WASM do idioma do Pagefind', async () => {
    const dir = await site({
      'busca/index.html':
        '<html lang="pt-BR" data-page-type="busca"><script src="/pagefind/pagefind-ui.js"></script></html>',
      'pagefind/pagefind-ui.js': 'ui',
      'pagefind/pagefind.js': noise(10),
      'pagefind/pagefind-worker.js': 'w',
      'pagefind/wasm.pt-br.pagefind': noise(10),
      'pagefind/wasm.unknown.pagefind': noise(200),
    });
    const { results, problems } = await measureBudgets(dir);
    expect(problems).toEqual([]);
    expect(results[0]?.kb).toBeGreaterThan(5);
    expect(results[0]?.kb).toBeLessThan(130);
  });
});
