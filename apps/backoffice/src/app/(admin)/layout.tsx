import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import CollapsibleSide from '@/components/layouts/CollapsibleSide';
import { NavigationIndicator } from '@/components/shared/NavigationIndicator';
import { NoAccessScreen } from '@/components/shared/NoAccessScreen';
import { PAGE_CONTAINER_GUTTER_X, PAGE_CONTAINER_GUTTER_Y } from '@/components/template/constants';
import ThemeSwitcher from '@/components/template/ThemeSwitcher';
import UserProfileDropdown from '@/components/template/UserProfileDropdown';
import classNames from '@/components/ui/utils/classNames';
import navigationConfig, { filterNavigation } from '@/configs/navigation.config';
import { parseThemeMode, THEME_COOKIE } from '@/configs/theme.config';

import { readVisibleSites } from './visible-sites.ts';

// Área autenticada: toda página daqui exige o JWT do Access e um usuário com papel. O
// domínio confere de novo a permissão de cada ação (nunca só aqui nem no proxy). A moldura é o
// CollapsibleSide do Ecme (#237; workspace#46): a árvore de navegação filtrada pelo RBAC e os
// sites visíveis saem daqui, do servidor, e a barra lateral marca o item pelo endereço. O modo
// de tema sai do mesmo cookie que o layout raiz lê, para a troca (#240) já vir marcada.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor.ok) {
    // Sem a moldura: o <main> dá a altura, os gutters e centraliza a tela de estado.
    return (
      <main
        className={classNames(
          'flex min-h-screen flex-col justify-center bg-gray-100 dark:bg-gray-950',
          PAGE_CONTAINER_GUTTER_X,
          PAGE_CONTAINER_GUTTER_Y,
        )}
      >
        <NoAccessScreen />
      </main>
    );
  }
  const sites = await readVisibleSites();
  const visible = sites?.ok ? sites.value.map((site) => ({ id: site.id, name: site.name })) : [];
  const themeMode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="min-h-screen">
      {/* Primeira parada do Tab (WCAG 2.4.1): visível só com foco; leva o foco ao <main>. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-neutral focus:px-3 focus:py-2 focus:text-sm dark:focus:bg-gray-950"
      >
        Pular para o conteúdo
      </a>
      <NavigationIndicator />
      <CollapsibleSide
        navigationTree={filterNavigation(navigationConfig, actor.value)}
        sites={visible}
        headerEnd={
          <>
            <ThemeSwitcher initialMode={themeMode} />
            <UserProfileDropdown email={actor.value.email} roles={actor.value.roles} />
          </>
        }
      >
        {/* tabIndex -1: a âncora do skip link leva o foco até aqui, não só a rolagem. Sem
            anel de foco: o <main> só recebe foco programático do skip link, e o anel contornaria
            a página inteira; o foco visível segue no próximo Tab. */}
        <main
          id="conteudo"
          tabIndex={-1}
          className={classNames(
            'flex-auto bg-gray-100 focus-visible:outline-none dark:bg-gray-950',
            PAGE_CONTAINER_GUTTER_X,
            PAGE_CONTAINER_GUTTER_Y,
          )}
        >
          {children}
        </main>
      </CollapsibleSide>
    </div>
  );
}
