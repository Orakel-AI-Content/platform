import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Contraste dos tokens do Backoffice (#85; paleta do Ecme desde #202), lidos do próprio
// globals.css nos dois temas. A razão é a da WCAG 2.x, como em packages/tokens/src/contrast.ts
// (que o pacote não exporta); a leitura de hex e OKLCH fica aqui para o Backoffice não depender
// do @orakel/tokens.

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
const dark = new Map([...light, ...variables(block(/^\.dark\s*\{([^}]*)\}/m))]);
const THEMES = { claro: light, escuro: dark };

/** Valor final da variável no tema, seguindo `var(--outra)` (os apelidos apontam para o Ecme). */
function resolve(theme: Theme, name: string, seen: readonly string[] = []): string | undefined {
  const value = theme.get(name);
  const reference = value === undefined ? undefined : /^var\(--([\w-]+)\)$/.exec(value);
  if (!reference) return value;
  if (seen.includes(name))
    throw new Error(`Referência circular: --${[...seen, name].join(' → --')}`);
  return resolve(theme, reference[1]!, [...seen, name]);
}

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

/** `#rrggbb` ou `#rrggbbaa` → sRGB codificado (0 a 1). O alfa é ignorado: as cores com
 *  transparência (os `-subtle` do Ecme) são fundos tingidos, fora dos pares de texto. */
export function hexToSrgb(value: string): [number, number, number] {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?$/i.exec(value);
  if (!match) throw new Error(`Cor fora do formato #rrggbb: ${value}`);
  return match.slice(1).map((pair) => parseInt(pair, 16) / 255) as [number, number, number];
}

function toSrgb(value: string): [number, number, number] {
  return value.startsWith('#') ? hexToSrgb(value) : oklchToSrgb(value);
}

function luminance(value: string): number {
  const [r, g, b] = toSrgb(value).map((c) =>
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
  // Apelidos de transição, como as telas ainda os combinam.
  ['foreground', 'background', 4.5],
  ['foreground', 'muted', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['destructive', 'background', 4.5],
  ['success-foreground', 'success', 4.5],
  ['info-foreground', 'info', 4.5],
  // Cores do Ecme como texto sobre o fundo, como fundo do texto e no hover do botão.
  ['primary', 'background', 4.5],
  ['primary-foreground', 'primary-mild', 4.5],
  ['error', 'background', 4.5],
  ['warning', 'background', 4.5],
  ['success', 'background', 4.5],
  ['info', 'background', 4.5],
  ['gray-900', 'gray-100', 4.5],
  ['gray-600', 'gray-100', 4.5],
  // Foco.
  ['ring', 'background', 3],
  ['ring', 'muted', 3],
];

type ThemeName = keyof typeof THEMES;

/**
 * Pares do Ecme (#217) como o tema os combina: no Ecme o tema escuro não troca tokens, troca o
 * degrau da escala pelas variantes `dark:`. As classes são as do template (body do
 * `tailwind/index.css`, `_card.css` e `_input.css` do design-reference), ou a substituta que o
 * port usa quando a do Ecme não chega ao mínimo (`ecme`, a original, e docs/migration/ecme.md).
 * Par novo com `dark:` num componente portado entra aqui.
 */
type EcmePair = {
  name: string;
  theme: ThemeName;
  text: string;
  background: string;
  minimum: number;
  ecme?: string;
  /** Fundo original do Ecme, quando a substituição é no fundo (#206, Avatar). */
  ecmeBackground?: string;
};

const ECME_PAIRS: readonly EcmePair[] = [
  // Claro.
  {
    name: 'texto do body',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
    ecme: 'text-gray-500',
  },
  {
    name: 'título no body',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    // O cartão não define cor de texto: herda a do body, já substituída.
    name: 'texto no cartão',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'título no cartão',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'texto do campo',
    theme: 'claro',
    text: 'text-gray-800',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'placeholder do campo',
    theme: 'claro',
    text: 'placeholder:text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
    ecme: 'placeholder:text-gray-400',
  },
  {
    name: 'link no body',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'link no cartão',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'foco no body',
    theme: 'claro',
    text: 'outline-ring',
    background: 'bg-gray-100',
    minimum: 3,
  },
  {
    name: 'foco no cartão',
    theme: 'claro',
    text: 'outline-ring',
    background: 'bg-white',
    minimum: 3,
  },
  // Escuro.
  {
    name: 'texto do body',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'título no body',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'texto no cartão',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'título no cartão',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'texto do campo',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
  {
    name: 'placeholder do campo',
    theme: 'escuro',
    text: 'dark:placeholder:text-gray-300',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
    ecme: 'placeholder:text-gray-400',
  },
  {
    name: 'link no body',
    theme: 'escuro',
    text: 'dark:text-primary',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'link no cartão',
    theme: 'escuro',
    text: 'dark:text-primary-mild',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
    ecme: 'text-primary',
  },
  {
    name: 'foco no body',
    theme: 'escuro',
    text: 'outline-ring',
    background: 'dark:bg-gray-950',
    minimum: 3,
  },
  {
    name: 'foco no cartão',
    theme: 'escuro',
    text: 'outline-ring',
    background: 'dark:bg-gray-800',
    minimum: 3,
  },
  // Button (#205): solid (normal e hover) e default.
  {
    name: 'botão solid',
    theme: 'claro',
    text: 'text-neutral',
    background: 'bg-primary',
    minimum: 4.5,
  },
  {
    name: 'botão solid no hover',
    theme: 'claro',
    text: 'text-neutral',
    background: 'hover:bg-primary-mild',
    minimum: 4.5,
  },
  {
    name: 'botão default',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'botão solid',
    theme: 'escuro',
    text: 'dark:text-gray-950',
    background: 'dark:bg-primary',
    minimum: 4.5,
    ecme: 'text-neutral',
  },
  {
    name: 'botão solid no hover',
    theme: 'escuro',
    text: 'dark:text-gray-950',
    background: 'dark:hover:bg-primary-mild',
    minimum: 4.5,
    ecme: 'text-neutral',
  },
  {
    name: 'botão default',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
  // Badge, Tag e Avatar (#206).
  {
    name: 'badge',
    theme: 'claro',
    text: 'text-neutral',
    background: 'bg-error',
    minimum: 4.5,
  },
  {
    name: 'tag',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'iniciais do avatar',
    theme: 'claro',
    text: 'text-gray-100',
    background: 'bg-gray-600',
    minimum: 4.5,
    ecmeBackground: 'bg-gray-400',
  },
  {
    name: 'badge',
    theme: 'escuro',
    text: 'dark:text-gray-950',
    background: 'dark:bg-error',
    minimum: 4.5,
    ecme: 'text-white',
  },
  {
    name: 'tag',
    theme: 'escuro',
    text: 'dark:text-gray-50',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
  {
    name: 'iniciais do avatar',
    theme: 'escuro',
    text: 'text-gray-100',
    background: 'dark:bg-gray-600',
    minimum: 4.5,
  },
  // Form e InputGroup (#207): mensagem de erro e asterisco do FormItem (`_form.css`) e o texto
  // do complemento do InputGroup (`Addon.tsx`).
  {
    name: 'mensagem de erro no body',
    theme: 'claro',
    text: 'text-error',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'mensagem de erro no cartão',
    theme: 'claro',
    text: 'text-error',
    background: 'bg-white',
    minimum: 4.5,
  },
  // SchemaForm (#245): aviso de campo sem editor, dentro da seção em Card.
  {
    name: 'aviso no cartão',
    theme: 'claro',
    text: 'text-warning',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'complemento do campo',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-200',
    minimum: 4.5,
  },
  {
    name: 'mensagem de erro no body',
    theme: 'escuro',
    text: 'dark:text-error',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'mensagem de erro no cartão',
    theme: 'escuro',
    text: 'dark:text-error',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'aviso no cartão',
    theme: 'escuro',
    text: 'dark:text-warning',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    // O Ecme herdava a cor do texto do body.
    name: 'complemento do campo',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-600',
    minimum: 4.5,
    ecme: 'dark:text-gray-400',
  },
  // Select (#208): opções do menu (`_select.css`, `Option.tsx`) e o valor múltiplo. A opção
  // escolhida tem fundo `primary-subtle` (10% de primary sobre o menu); o par é contra o menu, e
  // a substituta tem folga para o tingido (6,0:1 no claro e 5,4:1 no escuro, compostos).
  {
    name: 'opção do menu',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'opção em foco',
    theme: 'claro',
    text: 'text-gray-800',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'opção escolhida',
    theme: 'claro',
    text: 'text-primary-deep',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'valor múltiplo',
    theme: 'claro',
    text: 'text-gray-800',
    background: 'bg-gray-50',
    minimum: 4.5,
  },
  {
    name: 'opção do menu',
    theme: 'escuro',
    text: 'dark:text-gray-300',
    background: 'dark:bg-gray-900',
    minimum: 4.5,
  },
  {
    name: 'opção em foco',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'opção escolhida',
    theme: 'escuro',
    text: 'dark:text-primary-mild',
    background: 'dark:bg-gray-900',
    minimum: 4.5,
  },
  {
    name: 'valor múltiplo',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  // Dropdown (#210): item do menu (`_menu-item.css`) sobre o `dropdown-menu` (`_dropdown.css`).
  {
    name: 'item do menu',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'item do menu no hover',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'item ativo do menu',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'item do menu',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-900',
    minimum: 4.5,
  },
  {
    name: 'item do menu no hover',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
  {
    name: 'item ativo do menu',
    theme: 'escuro',
    text: 'dark:text-primary',
    background: 'dark:bg-gray-900',
    minimum: 4.5,
  },
  // Tooltip (#211): texto branco sobre a dica (`_tooltip.css`, `Tooltip.tsx`).
  {
    name: 'texto da dica',
    theme: 'claro',
    text: 'text-white',
    background: 'bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'texto da dica',
    theme: 'escuro',
    text: 'text-white',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  // Alert e Notification (#212). O fundo do alerta é o `-subtle` do tipo (10 a 27% da cor sobre
  // a página, alfa que este teste ignora): o par é contra a página, com folga para o tingido. O
  // texto da notificação herda o do body.
  {
    name: 'texto do alerta',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'título da notificação',
    theme: 'claro',
    text: 'text-gray-800',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'texto da notificação',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'texto do alerta',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'título da notificação',
    theme: 'escuro',
    text: 'dark:text-white',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
  {
    name: 'texto da notificação',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
  // Table e Tabs (#213): cabeçalho da tabela, aba e aba ativa (sublinhado e pílula). O
  // cabeçalho no claro é medido sobre o body, o fundo mais escuro em que aparece; o resto, sobre
  // o cartão, onde as telas os põem.
  {
    name: 'cabeçalho da tabela',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
    ecme: 'text-gray-500',
  },
  {
    name: 'aba',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'aba ativa',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'aba ativa em pílula',
    theme: 'claro',
    text: 'text-neutral',
    background: 'bg-primary',
    minimum: 4.5,
  },
  {
    name: 'cabeçalho da tabela',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'aba',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'aba ativa',
    theme: 'escuro',
    text: 'dark:text-primary-mild',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
    ecme: 'text-primary',
  },
  {
    name: 'aba ativa em pílula',
    theme: 'escuro',
    text: 'dark:text-gray-950',
    background: 'dark:bg-primary',
    minimum: 4.5,
    ecme: 'text-neutral',
  },
  // Pagination (#214): página, página no hover, página atual e total. A página e o total no
  // claro são medidos sobre o body, o fundo mais escuro em que aparecem; no escuro, sobre o
  // cartão.
  {
    name: 'página da paginação',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
    ecme: 'text-gray-500',
  },
  {
    name: 'página da paginação no hover',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'hover:bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'página atual da paginação',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'total da paginação',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
    ecme: 'text-gray-500',
  },
  {
    name: 'página da paginação',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'página da paginação no hover',
    theme: 'escuro',
    text: 'dark:hover:text-gray-100',
    background: 'dark:hover:bg-gray-600',
    minimum: 4.5,
  },
  {
    name: 'página atual da paginação',
    theme: 'escuro',
    text: 'dark:text-gray-950',
    background: 'dark:bg-primary',
    minimum: 4.5,
    ecme: 'text-neutral',
  },
  {
    name: 'total da paginação',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  // Menu (#235): item, item ativo (`_menu-item.css`) e rótulo do grupo (`_menu.css`) sobre a
  // barra lateral (`side-nav-bg` do Ecme: branco no claro, gray-800 no escuro). O rótulo sem
  // variante herda o texto do body; no escuro, o item ativo usa a substituta do `menu.css`.
  {
    name: 'item do menu na barra',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'item ativo do menu na barra',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'rótulo do grupo do menu',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'item do menu na barra',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'item ativo do menu na barra',
    theme: 'escuro',
    text: 'dark:text-primary-mild',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
    ecme: 'dark:text-primary',
  },
  {
    name: 'rótulo do grupo do menu',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  // Trilha de navegação (#243): o Ecme não tem breadcrumb. Os links usam a cor do `.heading-text`,
  // e o item atual e o separador usam a do texto do body, sobre o fundo do body do Ecme.
  {
    name: 'link da trilha',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'link da trilha no hover',
    theme: 'claro',
    text: 'text-primary',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'item atual da trilha',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'separador da trilha',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'link da trilha',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'link da trilha no hover',
    theme: 'escuro',
    text: 'dark:text-primary',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'item atual da trilha',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  {
    name: 'separador da trilha',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-950',
    minimum: 4.5,
  },
  // Moldura (#237): a marca na barra lateral (`side-nav-bg`) e o e-mail, os papéis e o "Sair" no
  // header (`.header`), os dois brancos no claro e gray-800 no escuro.
  {
    name: 'marca na barra',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'e-mail e papéis no header',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: '"Sair" no header',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'marca na barra',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'e-mail e papéis no header',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: '"Sair" no header',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  // Toggle da barra lateral (#238): o ícone (componente de interface, 3:1) sobre o header.
  {
    name: 'ícone do toggle da barra no header',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 3,
  },
  {
    name: 'ícone do toggle da barra no header',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-800',
    minimum: 3,
  },
  // Menu de perfil (#239): o cabeçalho do menu (e-mail e papéis) sobre o `dropdown-menu`.
  {
    name: 'e-mail no menu de perfil',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'papéis no menu de perfil',
    theme: 'claro',
    text: 'text-gray-600',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'e-mail no menu de perfil',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-900',
    minimum: 4.5,
  },
  {
    name: 'papéis no menu de perfil',
    theme: 'escuro',
    text: 'dark:text-gray-400',
    background: 'dark:bg-gray-900',
    minimum: 4.5,
  },
  // Seletor de site (#241): o nome ou as iniciais do site no gatilho, sobre a barra lateral
  // (`side-nav-bg`) e no hover. O site atual no menu é o "item ativo do menu".
  {
    name: 'seletor de site na barra',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-white',
    minimum: 4.5,
  },
  {
    name: 'seletor de site no hover',
    theme: 'claro',
    text: 'text-gray-900',
    background: 'bg-gray-100',
    minimum: 4.5,
  },
  {
    name: 'seletor de site na barra',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-800',
    minimum: 4.5,
  },
  {
    name: 'seletor de site no hover',
    theme: 'escuro',
    text: 'dark:text-gray-100',
    background: 'dark:bg-gray-700',
    minimum: 4.5,
  },
];

/** Classe do Tailwind → token do globals.css: `dark:placeholder:text-gray-300` → `gray-300`. */
function token(className: string): string {
  const name = className.replace(/^(?:[\w-]+:)*(?:text|bg|outline)-/, '');
  return name === 'white' ? 'neutral' : name;
}

/** Contraste de um par no tema dele; um token que falta é erro com o nome do par. */
function pairContrast(
  pair: EcmePair,
  text: string = pair.text,
  background: string = pair.background,
): number {
  const theme = THEMES[pair.theme];
  const fg = resolve(theme, token(text));
  const bg = resolve(theme, token(background));
  if (fg === undefined || bg === undefined)
    throw new Error(`${pair.name} (${pair.theme}): token ausente em ${text} ou ${background}`);
  return contrast(fg, bg);
}

describe('conversão hex', () => {
  it('lê #rrggbb e ignora o alfa de #rrggbbaa', () => {
    expect(hexToSrgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToSrgb('#2a85ff1a')).toEqual(hexToSrgb('#2a85ff'));
    expect(() => hexToSrgb('#fff')).toThrow();
  });
});

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
    const fg = resolve(theme, foreground);
    const bg = resolve(theme, background);
    expect(fg, `--${foreground}`).toBeDefined();
    expect(bg, `--${background}`).toBeDefined();
    expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
  });
});

describe('pares do Ecme como o tema os combina', () => {
  it.each(ECME_PAIRS.map((pair) => [`${pair.name} (${pair.theme})`, pair] as const))(
    '%s',
    (label, pair) => {
      const ratio = pairContrast(pair);
      expect(
        ratio,
        `${label}: ${pair.text} sobre ${pair.background} dá ${ratio.toFixed(2)}:1, abaixo de ${pair.minimum}:1`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    },
  );

  it('cada substituição troca uma classe do Ecme que não chega ao mínimo', () => {
    const substituted = ECME_PAIRS.filter(
      (p) => p.ecme !== undefined || p.ecmeBackground !== undefined,
    );
    for (const pair of substituted) {
      expect(
        pairContrast(pair, pair.ecme, pair.ecmeBackground),
        `${pair.name} (${pair.theme})`,
      ).toBeLessThan(pair.minimum);
    }
  });

  it('cobre os dois temas com os mesmos usos', () => {
    const uses = (theme: ThemeName) =>
      ECME_PAIRS.filter((pair) => pair.theme === theme).map((pair) => pair.name);
    expect(uses('escuro')).toEqual(uses('claro'));
  });
});
