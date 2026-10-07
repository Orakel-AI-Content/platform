import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Contraste dos tokens do Backoffice (#85), lidos do próprio globals.css nos dois temas. A
// razão é a da WCAG 2.x, como em packages/tokens/src/contrast.ts (que o pacote não exporta);
// a conversão OKLCH → sRGB fica aqui para o Backoffice não depender do @orakel/tokens.

const css = readFileSync(new URL('globals.css', import.meta.url), 'utf8');

type Theme = Map<string, string>;

/** Variáveis `--nome: valor;` de um bloco de CSS. */
function variables(block: string): Theme {
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]),
  );
}

function block(pattern: RegExp): string {
  const match = pattern.exec(css);
  if (!match) throw new Error(`Bloco não encontrado no globals.css: ${pattern}`);
  return match[1]!;
}

/** O tema escuro herda do claro o que não redefine. */
const light = variables(block(/^:root\s*\{([^}]*)\}/m));
const dark = new Map([
  ...light,
  ...variables(block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)),
]);
const THEMES = { claro: light, escuro: dark };

/** `oklch(L C h)` → sRGB codificado (0 a 1), cortado na gama. */
export function oklchToSrgb(value: string): [number, number, number] {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (!match) throw new Error(`Cor fora do formato oklch(L C h): ${value}`);
  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number];
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((c) => {
    const clamped = Math.min(1, Math.max(0, c));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

function luminance(value: string): number {
  const [r, g, b] = oklchToSrgb(value).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste, de 1 a 21. A WCAG não arredonda: 4,49 não passa em 4,5. */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** [primeiro plano, fundo, mínimo]: texto a 4,5:1 (1.4.3) e foco a 3:1 (1.4.11, 2.4.13). */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['foreground', 'background', 4.5],
  ['foreground', 'muted', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['destructive', 'background', 4.5],
  ['warning', 'background', 4.5],
  ['success', 'background', 4.5],
  ['success-foreground', 'success', 4.5],
  ['info', 'background', 4.5],
  ['info-foreground', 'info', 4.5],
  ['ring', 'background', 3],
];

describe('conversão OKLCH', () => {
  it('leva branco, preto e um vermelho conhecido ao sRGB', () => {
    expect(oklchToSrgb('oklch(1 0 0)').map((c) => Math.round(c * 255))).toEqual([255, 255, 255]);
    expect(oklchToSrgb('oklch(0 0 0)').map((c) => Math.round(c * 255))).toEqual([0, 0, 0]);
    // #ff0000 em OKLCH (CSS Color 4).
    expect(oklchToSrgb('oklch(0.62796 0.25768 29.2339)').map((c) => Math.round(c * 255))).toEqual([
      255, 0, 0,
    ]);
  });

  it('dá 21:1 entre branco e preto', () => {
    expect(contrast('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(21, 5);
  });
});

describe.each(Object.entries(THEMES))('tokens do tema %s', (_, theme) => {
  it.each(PAIRS)('%s sobre %s chega a %d:1', (foreground, background, minimum) => {
    const fg = theme.get(foreground);
    const bg = theme.get(background);
    expect(fg, `--${foreground}`).toBeDefined();
    expect(bg, `--${background}`).toBeDefined();
    expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
  });
});
