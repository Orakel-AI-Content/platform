// Orçamento de JS próprio por tipo de página (ADR-012 da plataforma), em kB gzip. Soma os
// scripts externos (seguindo os imports entre chunks) e os inline de cada HTML; JSON-LD
// não é script. A busca soma também o JS/WASM do Pagefind. Estouro é falha permanente.
// A busca tem 130 kB, não 80: o WASM do Pagefind 1.5 sozinho tem 72 kB (ADR 0010 da
// unidade; revisão da ADR-012 e do 12.0 pendente no workspace).
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

export const JS_BUDGET_KB: Readonly<Record<string, number>> = {
  artigo: 15,
  pagina: 15,
  institucional: 15,
  '404': 15,
  home: 20,
  categoria: 20,
  tag: 20,
  serie: 20,
  autor: 20,
  busca: 130,
};

export type PageScripts = { pageType: string | undefined; inline: string[]; external: string[] };

/** Scripts de um HTML: `src` externos (caminho do site) e conteúdo dos inline. */
export function scriptsOf(html: string): PageScripts {
  const pageType = /<html[^>]*\sdata-page-type="([^"]+)"/.exec(html)?.[1];
  const inline: string[] = [];
  const external: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = match[1] ?? '';
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    const src = /\ssrc="([^"]+)"/.exec(attrs)?.[1];
    if (src) external.push(src);
    else if ((match[2] ?? '').trim()) inline.push(match[2] ?? '');
  }
  for (const match of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
    if (match[1]) external.push(match[1]);
  }
  return { pageType, inline, external };
}

/** Imports relativos de um chunk JS (estáticos e dinâmicos). */
export function importsOf(code: string): string[] {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g)].map(
    (match) => match[1] ?? '',
  );
}

const gzipKb = (content: string | Uint8Array) => gzipSync(content).length / 1024;

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

export type BudgetResult = { page: string; pageType: string; kb: number; limit: number };

/** Mede todas as páginas do build em `dir`; devolve as medições e os estouros. */
export async function measureBudgets(
  dir: string,
): Promise<{ results: BudgetResult[]; problems: string[] }> {
  const sizes = new Map<string, number>();
  const problems: string[] = [];

  async function fileKb(file: string, seen: Set<string>): Promise<number> {
    if (seen.has(file)) return 0;
    seen.add(file);
    const content = await readFile(file).catch(() => undefined);
    if (content === undefined) {
      problems.push(`script ausente no build: ${relative(dir, file)}`);
      return 0;
    }
    const own = sizes.get(file) ?? gzipKb(content);
    sizes.set(file, own);
    let total = own;
    if (file.endsWith('.js')) {
      for (const specifier of importsOf(content.toString('utf8'))) {
        total += await fileKb(resolve(dirname(file), specifier), seen);
      }
    }
    return total;
  }

  /** O que a UI do Pagefind baixa ao buscar: a API, o worker e o WASM do idioma da página. */
  const pagefindExtras = async (language: string | undefined): Promise<string[]> => {
    const folder = join(dir, 'pagefind');
    const names = await readdir(folder).catch(() => [] as string[]);
    const wasm = names.includes(`wasm.${language}.pagefind`)
      ? `wasm.${language}.pagefind`
      : 'wasm.unknown.pagefind';
    return ['pagefind.js', 'pagefind-worker.js', wasm]
      .filter((name) => names.includes(name))
      .map((name) => join(folder, name));
  };

  const results: BudgetResult[] = [];
  for (const file of await htmlFiles(dir)) {
    const page = `/${relative(dir, file)}`;
    const html = await readFile(file, 'utf8');
    const { pageType, inline, external } = scriptsOf(html);
    const language = /<html[^>]*\slang="([^"]+)"/.exec(html)?.[1]?.toLowerCase();
    if (!pageType) {
      problems.push(`${page}: sem data-page-type`);
      continue;
    }
    const limit = JS_BUDGET_KB[pageType];
    if (limit === undefined) {
      problems.push(`${page}: tipo de página "${pageType}" sem orçamento`);
      continue;
    }
    const seen = new Set<string>();
    let kb = inline.reduce((sum, code) => sum + gzipKb(code), 0);
    for (const src of external) {
      if (/^https?:\/\//.test(src)) continue; // terceiros (GA4) carregam depois do load
      kb += await fileKb(join(dir, src), seen);
    }
    if (pageType === 'busca') {
      for (const extra of await pagefindExtras(language)) kb += await fileKb(extra, seen);
    }
    results.push({ page, pageType, kb, limit });
    if (kb > limit)
      problems.push(`${page} (${pageType}): ${kb.toFixed(1)} kB de JS, limite ${limit} kB`);
  }
  return { results, problems };
}
