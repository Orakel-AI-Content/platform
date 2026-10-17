import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { lookupSite } from './editorial-page.tsx';

// Layout do site (#78, workspace#42): título da aba com o nome do site e 404 de site
// inexistente. A barra lateral das áreas e o seletor de site moram na moldura do layout do
// admin (#237). Sem loading.tsx nem Suspense aqui, para o "não encontrado" continuar
// respondendo 404 (design-system.md). Sem sessão ou sem site.read, quem decide é a página.

type Params = { params: Promise<{ site: string }> };

/**
 * As páginas declaram só a área ("Mídia"); a aba fica "Mídia · <site> · Orakel Backoffice".
 * A página inicial do site (mesmo segmento, fora do template) usa o `default`, que recebe o
 * template do layout raiz.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const lookup = await lookupSite((await params).site);
  if (lookup.kind !== 'found') return {};
  const { name } = lookup.site;
  return { title: { default: name, template: `%s · ${name} · Orakel Backoffice` } };
}

export default async function SiteLayout({ children, params }: Params & { children: ReactNode }) {
  const lookup = await lookupSite((await params).site);
  if (lookup.kind === 'missing') notFound();
  return children;
}
