import type { ReactNode } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import CollapsibleSide from '@/components/layouts/collapsible-side';
import { NavigationIndicator } from '@/components/navigation-indicator';
import { PAGE_CONTAINER_GUTTER_X, PAGE_CONTAINER_GUTTER_Y } from '@/components/template/constants';
import UserProfileDropdown from '@/components/template/UserProfileDropdown';
import navigationConfig, { filterNavigation } from '@/configs/navigation.config';

import { readVisibleSites } from './visible-sites.ts';

// Área autenticada: toda página daqui exige o JWT do Access e um usuário com papel. O
// domínio confere de novo a permissão de cada ação (nunca só aqui nem no proxy). A moldura é o
// CollapsibleSide do Ecme (#237; workspace#46): a árvore de navegação filtrada pelo RBAC e os
// sites visíveis saem daqui, do servidor, e a barra lateral marca o item pelo endereço.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor.ok) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Sem acesso</h1>
        <p className="mt-2 text-muted-foreground">
          Sua identidade não tem acesso ao Backoffice. Peça a uma pessoa administradora.
        </p>
      </main>
    );
  }
  const sites = await readVisibleSites();
  const visible = sites?.ok ? sites.value.map((site) => ({ id: site.id, name: site.name })) : [];
  return (
    <div className="min-h-screen">
      {/* Primeira parada do Tab (WCAG 2.4.1): visível só com foco; leva o foco ao <main>. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Pular para o conteúdo
      </a>
      <NavigationIndicator />
      <CollapsibleSide
        navigationTree={filterNavigation(navigationConfig, actor.value)}
        sites={visible}
        headerEnd={<UserProfileDropdown email={actor.value.email} roles={actor.value.roles} />}
      >
        {/* tabIndex -1: a âncora do skip link leva o foco até aqui, não só a rolagem. */}
        <main
          id="conteudo"
          tabIndex={-1}
          className={`flex-auto bg-gray-100 dark:bg-gray-950 ${PAGE_CONTAINER_GUTTER_X} ${PAGE_CONTAINER_GUTTER_Y} focus-visible:outline-none`}
        >
          {children}
        </main>
      </CollapsibleSide>
    </div>
  );
}
