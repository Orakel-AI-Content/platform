import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildThemes, THEME_FILE } from './build.ts';

const THEMES = new URL('../themes/', import.meta.url);
const dirs: string[] = [];

async function tempDir(): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), 'orakel-tokens-'));
  dirs.push(dir);
  return pathToFileURL(`${dir}/`);
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

type ThemeDocument = {
  color: Record<string, unknown>;
  radius: Record<string, unknown>;
  $extensions?: { 'ai.orakel.theme': { fontFaces: { file: string }[] } };
};

/** Cópia dos temas reais com um documento alterado, para os casos de falha. */
async function themesWith(id: string, change: (theme: ThemeDocument) => void) {
  const themesDir = await tempDir();
  await cp(THEMES, themesDir, { recursive: true });
  const file = new URL(`${id}/${THEME_FILE}`, themesDir);
  const theme = JSON.parse(await readFile(file, 'utf8')) as ThemeDocument;
  change(theme);
  await writeFile(file, JSON.stringify(theme));
  return themesDir;
}

type Index = {
  THEME_IDS: readonly string[];
  isThemeId(id: string): boolean;
  themeCss(id: string): string | undefined;
  themeFonts(id: string): readonly { file: string; url: string; preload: boolean }[] | undefined;
};

describe('build dos temas reais', () => {
  it('gera CSS, fontes com hash e o módulo de entrada', async () => {
    const outDir = await tempDir();
    const result = await buildThemes({ themesDir: THEMES, outDir });
    expect(result.ok).toBe(true);

    expect((await readdir(new URL('themes/', outDir))).sort()).toEqual([
      'exemplo-a.css',
      'exemplo-b.css',
    ]);
    const fonts = await readdir(new URL('fonts/', outDir));
    expect(fonts).toHaveLength(4);
    for (const font of fonts) expect(font).toMatch(/^[a-z0-9-]+\.[0-9a-f]{8}\.woff2$/);

    const index = (await import(new URL('index.js', outDir).href)) as Index;
    expect(index.THEME_IDS).toEqual(['exemplo-a', 'exemplo-b']);
    expect(index.themeCss('exemplo-a')).toBe(
      await readFile(new URL('themes/exemplo-a.css', outDir), 'utf8'),
    );
    expect(index.themeCss('exemplo-b')).toContain('color-scheme: dark;');
    expect(index.themeCss('nao-existe')).toBeUndefined();
    expect(index.themeCss('toString')).toBeUndefined();
    expect(index.isThemeId('exemplo-a')).toBe(true);

    const bodyFont = index.themeFonts('exemplo-a')?.filter((font) => font.preload);
    expect(bodyFont).toHaveLength(1);
    expect(bodyFont?.[0]?.url).toBe(`/fonts/${bodyFont?.[0]?.file}`);
    expect(fonts).toContain(bodyFont?.[0]?.file);

    const dts = await readFile(new URL('index.d.ts', outDir), 'utf8');
    expect(dts).toContain(`export type ThemeId = "exemplo-a" | "exemplo-b";`);
  });

  it('é idempotente: a mesma entrada gera os mesmos arquivos', async () => {
    const [first, second] = [await tempDir(), await tempDir()];
    await buildThemes({ themesDir: THEMES, outDir: first });
    await buildThemes({ themesDir: THEMES, outDir: second });
    for (const file of ['index.js', 'themes/exemplo-a.css', 'themes/exemplo-b.css']) {
      expect(await readFile(new URL(file, second), 'utf8')).toBe(
        await readFile(new URL(file, first), 'utf8'),
      );
    }
  });
});

describe('build com temas inválidos', () => {
  it('agrega os problemas de um tema e não grava nada', async () => {
    const themesDir = await themesWith('exemplo-a', (theme) => {
      theme.color['text-muted'] = { $value: '{palette.neutral.400}' };
      delete theme.radius.full;
      theme.color.extra = { $value: '{palette.neutral.0}' };
      theme.$extensions!['ai.orakel.theme'].fontFaces[0]!.file = 'sumiu.woff2';
    });
    const outDir = await tempDir();
    const result = await buildThemes({ themesDir, outDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => `${issue.theme} ${issue.path} ${issue.code}`)).toEqual([
      'exemplo-a radius.full set.missing',
      'exemplo-a color.extra set.unexpected',
      'exemplo-a color.text-muted contrast.below-minimum',
      'exemplo-a color.text-muted contrast.below-minimum',
      'exemplo-a $extensions.ai.orakel.theme.fontFaces.0.file font.missing',
    ]);
    expect(await readdir(outDir)).toEqual([]);
  });

  it('aponta alias quebrado e JSON inválido em temas diferentes', async () => {
    const themesDir = await themesWith('exemplo-b', (theme) => {
      theme.color.link = { $value: '{palette.cyan.999}' };
    });
    await writeFile(new URL(`exemplo-a/${THEME_FILE}`, themesDir), '{ não é json');
    const result = await buildThemes({ themesDir, outDir: await tempDir() });
    expect(result.ok ? [] : result.issues.map((issue) => `${issue.theme} ${issue.code}`)).toEqual([
      'exemplo-a json.invalid',
      'exemplo-b alias.missing',
    ]);
  });

  it('exige a extensão do tema', async () => {
    const themesDir = await themesWith('exemplo-b', (theme) => {
      delete theme.$extensions;
    });
    const result = await buildThemes({ themesDir, outDir: await tempDir() });
    expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toEqual([
      '$extensions.ai.orakel.theme',
    ]);
  });
});
