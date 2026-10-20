import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

// Toda classe de cor usada nas telas resolve para uma cor do @theme (#202). Com a troca para a
// paleta do Ecme, um nome que sumisse do globals.css deixaria a classe sem efeito em silêncio:
// o Tailwind não gera utility para cor que não conhece. Só tokens do @theme e as palavras-chave
// do CSS; a paleta padrão do Tailwind (red-500…) não é usada (docs/migration/ecme.md, "Estilo").

const css = readFileSync(new URL('globals.css', import.meta.url), 'utf8');
const theme = /@theme inline\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const THEME_COLORS = new Set([...theme.matchAll(/--color-([\w-]+):/g)].map((match) => match[1]!));
const KEYWORDS = new Set(['transparent', 'current', 'inherit', 'black', 'white']);

/** Sufixos dessas utilities que não são cor: tamanho, lado, estilo, largura, deslocamento. */
const NOT_COLOR =
  /^(?:xs|sm|base|md|lg|xl|\dxl|left|center|right|justify|start|end|none|solid|dashed|dotted|double|hidden|inset|[xytblrse](?:-\d+)?|\d+|offset-\d+)$/;

const UTILITY =
  /(?:^|[\s"'`:])(bg|text|border(?:-[xytblrse])?|ring|outline|fill|stroke|divide|from|via|to|placeholder|decoration|accent|caret|shadow)-([a-z][a-z0-9-]*)(?:\/\d+)?(?=[\s"'`]|$)/gm;

const src = new URL('..', import.meta.url);
const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
  (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
);

/** Nomes de cor usados nas classes de `src/`, com o primeiro arquivo onde aparecem. */
function colorsInUse(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of files) {
    for (const [, , suffix] of readFileSync(new URL(file, src), 'utf8').matchAll(UTILITY)) {
      if (NOT_COLOR.test(suffix!) || used.has(suffix!)) continue;
      used.set(suffix!, file);
    }
  }
  return used;
}

describe('cores das classes de src/', () => {
  const used = colorsInUse();

  it('encontra as classes de cor das telas', () => {
    // Guarda contra o teste passar sem ler nada (regex ou caminho quebrado).
    expect(files.length).toBeGreaterThan(50);
    expect([...used.keys()]).toEqual(
      expect.arrayContaining(['primary', 'error', 'success', 'gray-500']),
    );
  });

  it.each([...used])('%s (em %s) é uma cor do @theme', (name) => {
    expect(THEME_COLORS.has(name) || KEYWORDS.has(name), `--color-${name} no @theme`).toBe(true);
  });
});

// O globals.css zera a paleta padrão do Tailwind (#399): compilado de verdade, uma cor fora da
// paleta do template não gera utility, e white, black e as palavras-chave continuam gerando.
const require = createRequire(import.meta.url);

/** Resolve os @import do globals.css: o `tailwindcss` pelo pacote, o resto relativo ao arquivo. */
async function loadStylesheet(id: string, base: string) {
  const path = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(base, id);
  return { path, base: dirname(path), content: await readFile(path, 'utf8') };
}

describe('paleta compilada do globals.css', async () => {
  const compiler = await compile(css, {
    base: fileURLToPath(new URL('.', import.meta.url)),
    loadStylesheet,
  });
  /** CSS gerado para uma classe sozinha (vazio quando o Tailwind não a conhece). */
  const generated = (candidate: string) =>
    compiler.build([candidate]).includes(`.${candidate.replace('/', '\\/')}`);

  it.each(['bg-red-500', 'text-blue-600', 'border-slate-200', 'bg-zinc-900'])(
    '%s, fora da paleta, não gera CSS',
    (candidate) => {
      expect(generated(candidate)).toBe(false);
    },
  );

  it.each([
    'bg-white',
    'text-black',
    'bg-transparent',
    'text-current',
    'bg-primary',
    'text-gray-500',
  ])('%s gera CSS', (candidate) => {
    expect(generated(candidate)).toBe(true);
  });
});
