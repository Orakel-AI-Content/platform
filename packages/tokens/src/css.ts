// Tema resolvido → CSS: `@font-face` + `:root { color-scheme; --<caminho>: … }`.
// Só os tokens semânticos saem; a paleta primitiva fica no JSON (ADR 0005).
import {
  PRIMITIVE_GROUP,
  toHex,
  type Color,
  type Dimension,
  type FontFamily,
  type ResolvedToken,
  type ShadowLayer,
  type ThemeExtension,
} from './schema.ts';

export type CssFontFace = {
  family: string;
  url: string;
  weight: number | string;
  style: 'normal' | 'italic';
};

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/** `color.text.muted` → `--color-text-muted`. */
export function variableName(path: string): string {
  return `--${path.replaceAll('.', '-')}`;
}

function color(value: Color): string {
  if (value.alpha === undefined || value.alpha === 1) return toHex(value);
  const [r, g, b] = value.components.map((c) => Math.round(c * 255));
  return `rgb(${r} ${g} ${b} / ${value.alpha})`;
}

function dimension(value: Dimension): string {
  return value.value === 0 ? '0' : `${value.value}${value.unit}`;
}

const quote = (name: string) => `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

function fontFamily(value: FontFamily): string {
  const names = Array.isArray(value) ? value : [value];
  return names.map((name) => (GENERIC_FAMILIES.has(name) ? name : quote(name))).join(', ');
}

function shadowLayer(layer: ShadowLayer): string {
  const parts = [layer.offsetX, layer.offsetY, layer.blur, layer.spread].map(dimension);
  return [layer.inset ? 'inset' : '', ...parts, color(layer.color)].filter(Boolean).join(' ');
}

export function cssValue(token: ResolvedToken): string {
  switch (token.type) {
    case 'color':
      return color(token.value);
    case 'dimension':
      return dimension(token.value);
    case 'fontFamily':
      return fontFamily(token.value);
    case 'number':
      return String(token.value);
    case 'shadow':
      return (Array.isArray(token.value) ? token.value : [token.value]).map(shadowLayer).join(', ');
  }
}

export function renderThemeCss(theme: {
  id: string;
  extension: ThemeExtension;
  tokens: ReadonlyMap<string, ResolvedToken>;
  fontFaces: readonly CssFontFace[];
}): string {
  const faces = theme.fontFaces.map(
    (face) =>
      `@font-face {\n` +
      `  font-family: ${quote(face.family)};\n` +
      `  src: url("${face.url}") format("woff2");\n` +
      `  font-weight: ${face.weight};\n` +
      `  font-style: ${face.style};\n` +
      `  font-display: swap;\n` +
      `}\n`,
  );
  // Ordem estável: a mesma entrada gera o mesmo CSS (idempotência do build do site).
  const variables = [...theme.tokens.values()]
    .filter((token) => !token.path.startsWith(`${PRIMITIVE_GROUP}.`))
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((token) => `  ${variableName(token.path)}: ${cssValue(token)};\n`);

  return (
    `/* @orakel/tokens — tema ${theme.id}. Gerado por src/build.ts; não edite. */\n` +
    faces.join('') +
    `:root {\n  color-scheme: ${theme.extension.colorScheme};\n${variables.join('')}}\n`
  );
}
