// Contraste da WCAG 2.x (P14): luminância relativa e razão, sobre os pares fixos (ADR 0004).
import { toHex, type Color, type Issue, type ResolvedToken } from './schema.ts';

/** Pares fixos, iguais para todos os temas: [primeiro plano, fundo, mínimo]. */
export const PAIRS: readonly (readonly [string, string, number])[] = [
  // 1.4.3 — texto (4,5:1 para todo texto, sem a exceção de texto grande)
  ['color.text', 'color.background', 4.5],
  ['color.text', 'color.surface', 4.5],
  ['color.text-muted', 'color.background', 4.5],
  ['color.text-muted', 'color.surface', 4.5],
  ['color.link', 'color.background', 4.5],
  ['color.link', 'color.surface', 4.5],
  ['color.on-accent', 'color.accent', 4.5],
  // 1.4.11 e 2.4.13 — foco e bordas de controle
  ['color.focus', 'color.background', 3],
  ['color.focus', 'color.surface', 3],
  ['color.border', 'color.background', 3],
];

function channel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Pick<Color, 'components'>): number {
  const [r, g, b] = color.components.map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste, de 1 a 21. A WCAG não arredonda: 4,49 não passa em 4,5. */
export function contrastRatio(a: Pick<Color, 'components'>, b: Pick<Color, 'components'>): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** Verifica os pares num tema já resolvido. Cores com transparência não entram em pares. */
export function checkContrast(tokens: ReadonlyMap<string, ResolvedToken>): Issue[] {
  const issues: Issue[] = [];
  const colorOf = (path: string): Color | undefined => {
    const token = tokens.get(path);
    return token?.type === 'color' ? token.value : undefined;
  };

  const translucent = new Set<string>();
  for (const path of new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]))) {
    const color = colorOf(path);
    if (color?.alpha !== undefined && color.alpha < 1) {
      translucent.add(path);
      issues.push({
        code: 'contrast.translucent',
        message: 'Cores dos pares de contraste não podem ter transparência',
        path,
      });
    }
  }

  for (const [fg, bg, minimum] of PAIRS) {
    const foreground = colorOf(fg);
    const background = colorOf(bg);
    // Token faltando é reportado pela verificação do conjunto (set.missing).
    if (!foreground || !background || translucent.has(fg) || translucent.has(bg)) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio < minimum) {
      issues.push({
        code: 'contrast.below-minimum',
        message: `${fg} (${toHex(foreground)}) sobre ${bg} (${toHex(background)}): ${Math.floor(ratio * 100) / 100}:1, mínimo ${minimum}:1`,
        path: fg,
      });
    }
  }
  return issues;
}
