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

// Camada base do Ecme (#395): compilada, cada regra cai na @layer base (ou components, a
// .heading-text), que o Tailwind declara antes de utilities. Assim o texto sem classe própria
// sai como no template, e uma utility da tela ainda vence a base.
type Rule = { layer: string | null; selector: string; body: string };

/** Regras do CSS compilado com a @layer que as contém (`null` fora de layer). */
function rules(output: string, layer: string | null = null): Rule[] {
  const found: Rule[] = [];
  const text = output.replace(/\/\*[\s\S]*?\*\//g, '');
  let start = 0;
  while (start < text.length) {
    const open = text.indexOf('{', start);
    if (open === -1) break;
    const selector = text.slice(start, open).split(/[;}]/).pop()!.trim();
    let depth = 1;
    let close = open + 1;
    for (; depth > 0; close++) depth += text[close] === '{' ? 1 : text[close] === '}' ? -1 : 0;
    const body = text.slice(open + 1, close - 1);
    const nested = /^@layer\s+([\w-]+)$/.exec(selector);
    if (nested) found.push(...rules(body, nested[1]));
    else found.push({ layer, selector: selector.replace(/\s+/g, ' '), body });
    start = close;
  }
  return found;
}

describe('camada base compilada do globals.css', async () => {
  const compiler = await compile(css, {
    base: fileURLToPath(new URL('.', import.meta.url)),
    loadStylesheet,
  });
  const output = compiler.build(['text-gray-900']);
  const all = rules(output);
  /** Corpo da regra com esse seletor; erro se não houver exatamente uma. */
  const rule = (selector: string) => {
    const matches = all.filter((r) => r.selector === selector);
    expect(matches, selector).toHaveLength(1);
    return matches[0]!;
  };

  it('declara a @layer base antes de utilities', () => {
    expect(output).toContain('@layer theme, base, components, utilities;');
  });

  it('põe o body só na @layer base, com o texto do template e o cinza AA', () => {
    const body = rule('body');
    expect(body.layer).toBe('base');
    expect(body.body).toContain('font-size: var(--text-sm)');
    expect(body.body).toContain('font-weight: var(--font-weight-medium)');
    expect(body.body).toContain('line-height: var(--leading-normal)');
    expect(body.body).toContain('-webkit-font-smoothing: antialiased');
    expect(body.body).toMatch(/^\s*color: var\(--gray-600\);/m);
    expect(body.body).toMatch(/&:is\(\.dark \*\) \{\s*color: var\(--gray-400\);/);
  });

  it('deixa uma utility da tela vencer o body', () => {
    expect(rule('.text-gray-900').layer).toBe('utilities');
  });

  it.each([
    ['h1, .h1', 'text-4xl', 'bold'],
    ['h2, .h2', 'text-3xl', 'bold'],
    ['h3, .h3', 'text-2xl', 'bold'],
    ['h4, .h4', 'text-xl', 'bold'],
    ['h5, .h5', 'text-lg', 'bold'],
    ['h6, .h6', 'text-base', 'semibold'],
  ])('%s em %s, font-%s e a cor de título', (selector, size, weight) => {
    const heading = rule(selector);
    expect(heading.layer).toBe('base');
    expect(heading.body).toContain(`font-size: var(--${size})`);
    expect(heading.body).toContain(`font-weight: var(--font-weight-${weight})`);
    expect(heading.body).toMatch(/^\s*color: var\(--gray-900\);/m);
    expect(heading.body).toMatch(/&:is\(\.dark \*\) \{\s*color: var\(--gray-100\);/);
  });

  it('dá cursor de mão a button e [role=button]', () => {
    const button = rule("button, [role='button']");
    expect(button.layer).toBe('base');
    expect(button.body).toContain('cursor: pointer');
  });

  it('pinta o hr de gray-200 no claro e gray-600 no escuro', () => {
    // A preflight do Tailwind tem outro `hr` (altura e borda superior), também na base.
    const hr = all.find((r) => r.selector === 'hr' && r.body.includes('--gray-200'));
    expect(hr?.layer).toBe('base');
    expect(hr!.body).toMatch(/^\s*border-color: var\(--gray-200\);/m);
    expect(hr!.body).toMatch(/&:is\(\.dark \*\) \{\s*border-color: var\(--gray-600\);/);
  });

  it('define a .heading-text com a cor de título, em components', () => {
    const heading = rule('.heading-text');
    expect(heading.layer).toBe('components');
    expect(heading.body).toMatch(/^\s*color: var\(--gray-900\);/m);
    expect(heading.body).toMatch(/&:is\(\.dark \*\) \{\s*color: var\(--gray-100\);/);
  });
});
