// Trilhas do `PageHeader` (#173, #174), sem React nem JSX: servem a Server Components e a
// testes sem DOM.

/** Item da trilha: com `href`, é link; sem, é a tela atual (o último). */
export type TrailItem = { label: string; href?: string };

/** Área da trilha: só o rótulo (tela da área) ou rótulo e segmento (link, nas telas de item). */
type TrailArea = string | { label: string; segment: string };

/**
 * Trilha a partir da raiz: `Sites › <itens>`. Sem itens, `Sites` é a tela atual.
 */
export function sitesTrail(items: readonly TrailItem[] = []): TrailItem[] {
  if (items.length === 0) return [{ label: 'Sites' }];
  return [{ label: 'Sites', href: '/sites' }, ...items];
}

/**
 * Trilha das telas de um site (#173, #174): `Sites › <nome> [› <área> [› <itens>]]`. Com
 * itens, a área vira link para a lista dela (`/sites/<id>/<segment>`).
 */
export function siteTrail(
  site: { id: string; name: string },
  area?: TrailArea,
  items: readonly TrailItem[] = [],
): TrailItem[] {
  if (area === undefined) return sitesTrail([{ label: site.name }]);
  const siteItem = { label: site.name, href: `/sites/${site.id}` };
  if (typeof area === 'string') return sitesTrail([siteItem, { label: area }]);
  if (items.length === 0) return sitesTrail([siteItem, { label: area.label }]);
  return sitesTrail([
    siteItem,
    { label: area.label, href: `/sites/${site.id}/${area.segment}` },
    ...items,
  ]);
}
