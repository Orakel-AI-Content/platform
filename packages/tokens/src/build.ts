// Build do pacote: themes/<id>/theme.tokens.json → dist/ (ADR 0002 e 0003 da unidade).
//
//   node src/build.ts
//
// Valida todos os temas antes de gravar qualquer coisa: com um erro, sai com código 1,
// lista todos os problemas e deixa dist/ como estava.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { checkContrast } from './contrast.ts';
import { renderThemeCss } from './css.ts';
import { FONTS_URL, hashedFontName } from './fonts.ts';
import { resolveTokens } from './resolve.ts';
import {
  EXTENSION,
  PRIMITIVE_GROUP,
  SEMANTIC_TOKENS,
  ThemeExtensionSchema,
  toHex,
  type Issue,
  type ResolvedToken,
  type Result,
} from './schema.ts';

export const THEME_FILE = 'theme.tokens.json';
const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ThemeFont = {
  /** Nome em `dist/fonts/` e no site (`/fonts/<file>`), com hash. */
  file: string;
  url: string;
  family: string;
  weight: number | string;
  style: 'normal' | 'italic';
  preload: boolean;
};

/** Cores da amostra do tema (hex dos semânticos já resolvidos). */
export const SUMMARY_COLORS = ['background', 'text', 'accent'] as const;

export type ThemeSummary = {
  name: string;
  colors: Record<(typeof SUMMARY_COLORS)[number], string>;
};

export type BuiltTheme = {
  id: string;
  css: string;
  summary: ThemeSummary;
  fonts: ThemeFont[];
  /** Conteúdo das fontes, por `file`; gravado em dist/fonts/. */
  fontFiles: Map<string, Uint8Array>;
};

export type ThemeIssue = Issue & { theme: string };

/** Confere o conjunto semântico fixo: nada faltando, nada sobrando, tipos certos. */
export function checkSemanticSet(tokens: ReadonlyMap<string, ResolvedToken>): Issue[] {
  const issues: Issue[] = [];
  for (const [path, type] of Object.entries(SEMANTIC_TOKENS)) {
    const token = tokens.get(path);
    if (!token) issues.push({ code: 'set.missing', message: `Falta o token (${type})`, path });
    else if (token.type !== type)
      issues.push({ code: 'set.type', message: `Esperado ${type}, veio ${token.type}`, path });
  }
  for (const path of tokens.keys()) {
    if (path.startsWith(`${PRIMITIVE_GROUP}.`) || path in SEMANTIC_TOKENS) continue;
    issues.push({
      code: 'set.unexpected',
      message: `Token fora do conjunto semântico (primitivos ficam em "${PRIMITIVE_GROUP}")`,
      path,
    });
  }
  return issues;
}

/** Valida e gera um tema. `readFont` devolve o conteúdo de `themes/<id>/fonts/<file>`. */
export function buildTheme(
  id: string,
  document: unknown,
  readFont: (file: string) => Uint8Array | undefined,
): Result<BuiltTheme> {
  if (!THEME_ID.test(id)) {
    return {
      ok: false,
      issues: [{ code: 'theme.id', message: 'O ID do tema é um slug (a-z, 0-9, -)', path: '' }],
    };
  }
  const resolved = resolveTokens(document);
  if (!resolved.ok) return resolved;
  const tokens = resolved.value;

  const issues: Issue[] = [...checkSemanticSet(tokens), ...checkContrast(tokens)];

  const rawExtension = (document as { $extensions?: Record<string, unknown> }).$extensions?.[
    EXTENSION
  ];
  const extension = ThemeExtensionSchema.safeParse(rawExtension);
  if (!extension.success) {
    for (const issue of extension.error.issues) {
      issues.push({
        code: `schema.${issue.code}`,
        message: issue.message,
        path: ['$extensions', EXTENSION, ...issue.path.map(String)].join('.'),
      });
    }
    return { ok: false, issues };
  }

  const fonts: ThemeFont[] = [];
  const fontFiles = new Map<string, Uint8Array>();
  extension.data.fontFaces.forEach((face, index) => {
    const content = readFont(face.file);
    if (!content) {
      issues.push({
        code: 'font.missing',
        message: `Arquivo themes/${id}/fonts/${face.file} não existe`,
        path: `$extensions.${EXTENSION}.fontFaces.${index}.file`,
      });
      return;
    }
    const file = hashedFontName(face.file, content);
    fontFiles.set(file, content);
    fonts.push({
      file,
      url: `${FONTS_URL}${file}`,
      family: face.family,
      weight: face.weight,
      style: face.style,
      preload: face.preload,
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  const css = renderThemeCss({ id, extension: extension.data, tokens, fontFaces: fonts });
  const colors = Object.fromEntries(
    SUMMARY_COLORS.map((name) => {
      // O conjunto fixo já foi conferido: `color.<name>` existe e é cor.
      const token = tokens.get(`color.${name}`);
      return [name, token?.type === 'color' ? toHex(token.value) : ''];
    }),
  ) as ThemeSummary['colors'];
  const summary: ThemeSummary = { name: extension.data.name, colors };
  return { ok: true, value: { id, css, summary, fonts, fontFiles } };
}

/** Módulo de entrada do pacote: CSS embutido, sem ler arquivo em runtime. */
export function renderIndex(themes: readonly BuiltTheme[]): { js: string; dts: string } {
  const data = Object.fromEntries(
    themes.map((theme) => [
      theme.id,
      { css: theme.css, fonts: theme.fonts, summary: theme.summary },
    ]),
  );
  const js = `// @orakel/tokens — gerado por src/build.ts; não edite.
const THEMES = ${JSON.stringify(data, null, 2)};

export const THEME_IDS = Object.freeze(Object.keys(THEMES));

export function isThemeId(id) {
  return Object.hasOwn(THEMES, id);
}

export function themeCss(id) {
  return isThemeId(id) ? THEMES[id].css : undefined;
}

export function themeFonts(id) {
  return isThemeId(id) ? THEMES[id].fonts : undefined;
}

export const THEME_SUMMARIES = Object.freeze(
  THEME_IDS.map((id) => Object.freeze({ id, ...THEMES[id].summary })),
);

export function themeSummary(id) {
  return THEME_SUMMARIES.find((summary) => summary.id === id);
}
`;
  const ids = themes.map((theme) => JSON.stringify(theme.id)).join(' | ') || 'never';
  const dts = `// @orakel/tokens — gerado por src/build.ts; não edite.
export type ThemeId = ${ids};

export interface ThemeFont {
  /** Nome em dist/fonts/ (exportado como @orakel/tokens/fonts/<file>), com hash. */
  readonly file: string;
  /** Caminho público no site: o blog copia o arquivo para cá. */
  readonly url: string;
  readonly family: string;
  readonly weight: number | string;
  readonly style: 'normal' | 'italic';
  /** Só a fonte do texto: <link rel="preload" as="font" type="font/woff2" crossorigin>. */
  readonly preload: boolean;
}

export declare const THEME_IDS: readonly ThemeId[];
export declare function isThemeId(id: string): id is ThemeId;
/** CSS do tema (@font-face + variáveis em :root), ou undefined se o tema não existe. */
export declare function themeCss(id: string): string | undefined;
export declare function themeFonts(id: string): readonly ThemeFont[] | undefined;

export interface ThemeSummary {
  readonly id: ThemeId;
  /** Nome legível, para escolher o tema. */
  readonly name: string;
  /** Amostra do tema: hex (#rrggbb) dos semânticos de fundo, texto e destaque. */
  readonly colors: { readonly background: string; readonly text: string; readonly accent: string };
}

/** Um resumo por tema, na ordem de THEME_IDS. */
export declare const THEME_SUMMARIES: readonly ThemeSummary[];
/** Nome e amostra do tema, ou undefined se o tema não existe. */
export declare function themeSummary(id: string): ThemeSummary | undefined;
`;
  return { js, dts };
}

export async function buildThemes(options: {
  themesDir: URL;
  outDir: URL;
}): Promise<{ ok: true; value: BuiltTheme[] } | { ok: false; issues: ThemeIssue[] }> {
  const entries = await readdir(options.themesDir, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (ids.length === 0) {
    return {
      ok: false,
      issues: [{ theme: '-', code: 'theme.none', message: 'Nenhum tema em themes/', path: '' }],
    };
  }

  const issues: ThemeIssue[] = [];
  const themes: BuiltTheme[] = [];
  for (const id of ids) {
    const dir = new URL(`${id}/`, options.themesDir);
    let document: unknown;
    try {
      document = JSON.parse(await readFile(new URL(THEME_FILE, dir), 'utf8'));
    } catch (error) {
      issues.push({ theme: id, code: 'json.invalid', message: String(error), path: THEME_FILE });
      continue;
    }
    const fonts = new Map<string, Uint8Array>();
    const fontsDir = new URL('fonts/', dir);
    for (const name of await readdir(fontsDir).catch(() => [])) {
      if (name.endsWith('.woff2')) fonts.set(name, await readFile(new URL(name, fontsDir)));
    }
    const result = buildTheme(id, document, (file) => fonts.get(file));
    if (result.ok) themes.push(result.value);
    else issues.push(...result.issues.map((issue) => ({ theme: id, ...issue })));
  }
  if (issues.length > 0) return { ok: false, issues };

  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(new URL('themes/', options.outDir), { recursive: true });
  await mkdir(new URL('fonts/', options.outDir), { recursive: true });
  for (const theme of themes) {
    await writeFile(new URL(`themes/${theme.id}.css`, options.outDir), theme.css);
    for (const [file, content] of theme.fontFiles) {
      await writeFile(new URL(`fonts/${file}`, options.outDir), content);
    }
  }
  const index = renderIndex(themes);
  await writeFile(new URL('index.js', options.outDir), index.js);
  await writeFile(new URL('index.d.ts', options.outDir), index.dts);
  return { ok: true, value: themes };
}

if (import.meta.main) {
  const result = await buildThemes({
    themesDir: new URL('../themes/', import.meta.url),
    outDir: new URL('../dist/', import.meta.url),
  });
  if (result.ok) {
    console.log(`@orakel/tokens: ${result.value.map((theme) => theme.id).join(', ')} → dist/`);
  } else {
    console.error(`@orakel/tokens: build falhou (${result.issues.length} problema(s))`);
    for (const issue of result.issues) {
      console.error(
        `  [${issue.theme}] ${issue.path || '(tema)'} — ${issue.code}: ${issue.message}`,
      );
    }
    process.exitCode = 1;
  }
}
