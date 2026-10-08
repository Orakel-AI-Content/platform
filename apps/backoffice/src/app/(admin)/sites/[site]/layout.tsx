import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { SiteNav, type SiteNavItem } from '@/components/site-nav';
import { SiteSwitcher } from '@/components/site-switcher';
import { can } from '@/domain/access/rbac.ts';

import { lookupSite } from './editorial-page.tsx';

// Layout do site (#78, workspace#42): título da aba com o nome do site, 404 de site
// inexistente e a barra lateral das áreas. Sem loading.tsx nem Suspense aqui, para o "não
// encontrado" continuar respondendo 404 (design-system.md).

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
  // Sem sessão ou sem site.read, quem decide é a página (cada uma tem a sua mensagem).
  if (lookup.kind !== 'found') return children;
  const items: SiteNavItem[] = [
    { segment: '', label: 'Visão geral' },
    { segment: 'conteudos', label: 'Conteúdos' },
    { segment: 'revisao', label: 'Revisão' },
    { segment: 'midia', label: 'Mídia' },
    { segment: 'autores', label: 'Autores' },
    { segment: 'taxonomias', label: 'Taxonomias' },
    { segment: 'menus', label: 'Menus' },
    // Só para quem edita: a tela é um formulário (content.write).
    ...(can(lookup.actor, 'content.write')
      ? [{ segment: 'institucionais', label: 'Textos institucionais' }]
      : []),
  ];
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <SiteSwitcher
          current={{ id: lookup.site.id, name: lookup.site.name }}
          sites={lookup.sites.map((site) => ({ id: site.id, name: site.name }))}
        />
        <SiteNav siteId={lookup.site.id} items={items} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
