// Links internos ganham o prefixo do site na visualização (`/<site>/…`); externos ficam como estão.
export function sitePath(base: string, href: string): string {
  return href.startsWith('/') && !href.startsWith('//') ? `${base}${href}` : href;
}

/** `/exemplo-a/guia-completo` → `{ site: 'exemplo-a', path: '/guia-completo/' }`. */
export function splitPreviewPath(pathname: string): { site: string; path: string } | undefined {
  const [, site, ...rest] = pathname.split('/');
  if (!site || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site)) return undefined;
  const inner = rest.filter(Boolean).join('/');
  return { site, path: inner ? `/${inner}/` : '/' };
}
