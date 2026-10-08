import { describe, expect, it } from 'vitest';
import { cssValue, renderThemeCss, variableName } from './css.ts';
import type { ResolvedToken } from './schema.ts';

const ink = {
  colorSpace: 'srgb' as const,
  components: [0.1098, 0.102, 0.0902] as [number, number, number],
};
const px = (value: number) => ({ value, unit: 'px' as const });

describe('CSS do tema', () => {
  it('o nome da variável é o caminho do token', () => {
    expect(variableName('color.text-muted')).toBe('--color-text-muted');
    expect(variableName('font.line-height.2xl')).toBe('--font-line-height-2xl');
  });

  it('formata cada tipo', () => {
    const value = (token: ResolvedToken) => cssValue(token);
    expect(value({ path: 'c', type: 'color', value: ink })).toBe('#1c1a17');
    expect(value({ path: 'c', type: 'color', value: { ...ink, alpha: 0.08 } })).toBe(
      'rgb(28 26 23 / 0.08)',
    );
    expect(value({ path: 'd', type: 'dimension', value: { value: 1.5, unit: 'rem' } })).toBe(
      '1.5rem',
    );
    expect(value({ path: 'd', type: 'dimension', value: px(0) })).toBe('0');
    expect(
      value({
        path: 'f',
        type: 'fontFamily',
        value: ['Source Serif 4 Variable', 'Georgia', 'serif'],
      }),
    ).toBe('"Source Serif 4 Variable", "Georgia", serif');
    expect(value({ path: 'n', type: 'number', value: 1.6 })).toBe('1.6');
    expect(
      value({
        path: 's',
        type: 'shadow',
        value: [
          { color: ink, offsetX: px(0), offsetY: px(2), blur: px(4), spread: px(0) },
          { color: ink, offsetX: px(0), offsetY: px(8), blur: px(16), spread: px(-4), inset: true },
        ],
      }),
    ).toBe('0 2px 4px 0 #1c1a17, inset 0 8px 16px -4px #1c1a17');
  });

  it('gera @font-face e :root só com os semânticos, em ordem estável', () => {
    const tokens = new Map<string, ResolvedToken>([
      ['palette.ink', { path: 'palette.ink', type: 'color', value: ink }],
      ['space.1', { path: 'space.1', type: 'dimension', value: { value: 0.25, unit: 'rem' } }],
      ['color.text', { path: 'color.text', type: 'color', value: ink }],
    ]);
    const css = renderThemeCss({
      id: 'teste',
      extension: { name: 'Teste', colorScheme: 'light', fontFaces: [] },
      tokens,
      fontFaces: [
        {
          family: 'Inter Variable',
          url: '/fonts/inter.abc.woff2',
          weight: '100 900',
          style: 'normal',
        },
      ],
    });
    expect(css).toBe(
      `/* @orakel/tokens — tema teste. Gerado por src/build.ts; não edite. */
@font-face {
  font-family: "Inter Variable";
  src: url("/fonts/inter.abc.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
:root {
  color-scheme: light;
  --color-text: #1c1a17;
  --space-1: 0.25rem;
}
`,
    );
  });
});
