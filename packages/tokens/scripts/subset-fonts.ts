// Traz as fontes dos temas para themes/<id>/fonts/ (ADR 0006 da unidade). Roda à mão,
// fora do build, e o resultado é commitado:
//
//   pnpm fonts
//
// Usa os arquivos do Fontsource, já em subset latino (U+0000-00FF e afins: cobre os
// acentos do português), baixados com `npm pack` na versão fixada abaixo — sem Python nem
// dependência no catalog. Copia também a licença (OFL) ao lado de cada arquivo.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type FontSource = {
  theme: string;
  /** Pacote do Fontsource (variável) e versão fixada. */
  pkg: string;
  version: string;
  /** Arquivo dentro de `files/` do pacote. */
  source: string;
  /** Nome em themes/<id>/fonts/ (referenciado no `fontFaces` do tema). */
  target: string;
};

const FONTS: FontSource[] = [
  {
    theme: 'exemplo-a',
    pkg: '@fontsource-variable/inter',
    version: '5.3.0',
    source: 'inter-latin-wght-normal.woff2',
    target: 'inter.woff2',
  },
  {
    theme: 'exemplo-a',
    pkg: '@fontsource-variable/source-serif-4',
    version: '5.3.0',
    source: 'source-serif-4-latin-wght-normal.woff2',
    target: 'source-serif-4.woff2',
  },
  {
    theme: 'exemplo-b',
    pkg: '@fontsource-variable/work-sans',
    version: '5.3.0',
    source: 'work-sans-latin-wght-normal.woff2',
    target: 'work-sans.woff2',
  },
  {
    theme: 'exemplo-b',
    pkg: '@fontsource-variable/space-grotesk',
    version: '5.3.0',
    source: 'space-grotesk-latin-wght-normal.woff2',
    target: 'space-grotesk.woff2',
  },
];

const themesDir = new URL('../themes/', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'orakel-fonts-'));
try {
  for (const font of FONTS) {
    const tarball = execFileSync(
      'npm',
      ['pack', `${font.pkg}@${font.version}`, '--pack-destination', work, '--silent'],
      { encoding: 'utf8' },
    ).trim();
    const dir = join(work, tarball.replace(/\.tgz$/, ''));
    mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['xzf', join(work, tarball), '-C', dir]);

    const out = join(themesDir, font.theme, 'fonts');
    mkdirSync(out, { recursive: true });
    copyFileSync(join(dir, 'package/files', font.source), join(out, font.target));
    copyFileSync(
      join(dir, 'package/LICENSE'),
      join(out, font.target.replace(/\.woff2$/, '.LICENSE.txt')),
    );
    console.log(`${font.theme}: ${font.pkg}@${font.version} → fonts/${font.target}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
