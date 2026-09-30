import { describe, expect, it } from 'vitest';
import { checkContrast, contrastRatio, relativeLuminance } from './contrast.ts';
import type { Color, ResolvedToken } from './schema.ts';

const hex = (value: string, alpha?: number): Color => ({
  colorSpace: 'srgb',
  components: [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ],
  ...(alpha === undefined ? {} : { alpha }),
});

function colors(entries: Record<string, Color>): Map<string, ResolvedToken> {
  return new Map(
    Object.entries(entries).map(([name, value]) => [
      `color.${name}`,
      { path: `color.${name}`, type: 'color', value },
    ]),
  );
}

const passing = {
  background: hex('#ffffff'),
  surface: hex('#f7f5f0'),
  text: hex('#1c1a17'),
  'text-muted': hex('#57534e'),
  link: hex('#1e40af'),
  accent: hex('#a61b1b'),
  'on-accent': hex('#ffffff'),
  focus: hex('#1d4ed8'),
  border: hex('#8a847b'),
};

describe('contraste da WCAG', () => {
  it('reproduz os valores de referência', () => {
    expect(relativeLuminance(hex('#ffffff'))).toBe(1);
    expect(relativeLuminance(hex('#000000'))).toBe(0);
    expect(contrastRatio(hex('#000000'), hex('#ffffff'))).toBe(21);
    expect(contrastRatio(hex('#ffffff'), hex('#000000'))).toBe(21);
    // #767676 é o cinza mais claro que passa 4,5:1 sobre branco; #777777 não passa.
    expect(contrastRatio(hex('#767676'), hex('#ffffff'))).toBeCloseTo(4.54, 2);
    expect(contrastRatio(hex('#777777'), hex('#ffffff'))).toBeLessThan(4.5);
  });

  it('aceita um tema que cumpre todos os pares', () => {
    expect(checkContrast(colors(passing))).toEqual([]);
  });

  it('reprova texto abaixo de 4,5:1 com as cores e a razão na mensagem', () => {
    const issues = checkContrast(colors({ ...passing, 'text-muted': hex('#8a847b') }));
    expect(issues.map((issue) => issue.code)).toEqual([
      'contrast.below-minimum',
      'contrast.below-minimum',
    ]);
    expect(issues[0]?.message).toContain(
      'color.text-muted (#8a847b) sobre color.background (#ffffff)',
    );
    expect(issues[0]?.message).toMatch(/: 3\.\d+:1, mínimo 4\.5:1$/);
  });

  it('exige 3:1 no foco e na borda', () => {
    const issues = checkContrast(
      colors({ ...passing, focus: hex('#b0c4f0'), border: hex('#d6d3cc') }),
    );
    expect(issues.map((issue) => `${issue.path}`)).toEqual([
      'color.focus',
      'color.focus',
      'color.border',
    ]);
  });

  it('não aceita transparência nas cores dos pares', () => {
    const issues = checkContrast(colors({ ...passing, border: hex('#000000', 0.5) }));
    expect(issues).toEqual([
      expect.objectContaining({ code: 'contrast.translucent', path: 'color.border' }),
    ]);
  });
});
