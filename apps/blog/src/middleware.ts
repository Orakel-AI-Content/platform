// Só na visualização (SSR): `/<site>/<caminho>` → contexto da página, com noindex em toda
// resposta. As fontes do tema são servidas daqui (no estático, o build as copia para /fonts/).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { defineMiddleware } from 'astro:middleware';

import { loadPreviewSite } from './data/preview.ts';
import { previewEnv } from './env.ts';
import { splitPreviewPath } from './render/links.ts';

const require = createRequire(import.meta.url);

async function font(pathname: string): Promise<Response> {
  const file = pathname.slice('/fonts/'.length);
  if (!/^[a-z0-9-]+\.[0-9a-f]{8}\.woff2$/.test(file)) return new Response(null, { status: 404 });
  try {
    const body = await readFile(require.resolve(`@orakel/tokens/fonts/${file}`));
    return new Response(body, {
      headers: {
        'content-type': 'font/woff2',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (import.meta.env.BLOG_OUTPUT !== 'preview') return next();

  const { pathname } = context.url;
  if (pathname.startsWith('/_astro/')) return next();
  if (pathname.startsWith('/fonts/')) return font(pathname);
  if (!pathname.endsWith('/')) return context.redirect(`${pathname}/${context.url.search}`, 308);

  const target = splitPreviewPath(pathname);
  if (!target) {
    return new Response('Visualização: use /<site>/<caminho>', {
      status: 404,
      headers: { 'x-robots-tag': 'noindex' },
    });
  }
  const site = await loadPreviewSite(target.site, previewEnv());
  if (!site) {
    return new Response(`Site "${target.site}" não encontrado`, {
      status: 404,
      headers: { 'x-robots-tag': 'noindex' },
    });
  }
  context.locals.page = { site, path: target.path, base: `/${target.site}`, preview: true };
  const response = await next();
  response.headers.set('x-robots-tag', 'noindex');
  return response;
});
