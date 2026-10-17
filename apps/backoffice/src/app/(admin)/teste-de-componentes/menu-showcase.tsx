'use client';

import Link from 'next/link';
import { useState } from 'react';
import { HiOutlineDocumentText, HiOutlineHome, HiOutlinePhotograph } from 'react-icons/hi';

import NavToggle from '@/components/shared/NavToggle';
import { Card } from '@/components/ui/Card';
import { Menu } from '@/components/ui/Menu';

// Seção do Menu e do NavToggle na vitrine (#235): um grupo com rótulo e um item ativo, como a
// barra lateral do Ecme (`VerticalSingleMenuItem`: o link ocupa o item). O NavToggle fica num
// botão com nome e `aria-expanded`, como o SideNavToggle do template; recolher esconde o rótulo
// do grupo (`sideCollapsed`). Nome do landmark próprio, para não repetir os da moldura.

const ITENS = [
  {
    key: 'visao-geral',
    title: 'Visão geral',
    href: '/teste-de-componentes?menu=visao-geral',
    icon: HiOutlineHome,
  },
  {
    key: 'conteudos',
    title: 'Conteúdos',
    href: '/teste-de-componentes',
    icon: HiOutlineDocumentText,
  },
  {
    key: 'midia',
    title: 'Mídia',
    href: '/teste-de-componentes?menu=midia',
    icon: HiOutlinePhotograph,
  },
];

const ATIVO = 'conteudos';

export function MenuShowcase() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section aria-labelledby="vitrine-menu" className="space-y-3">
      <h2 id="vitrine-menu" className="text-lg font-semibold">
        Menu
      </h2>
      <Card>
        <div className="space-y-3">
          <button
            type="button"
            aria-label="Alternar o menu de exemplo"
            aria-expanded={!collapsed}
            aria-controls="vitrine-menu-nav"
            className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => setCollapsed((value) => !value)}
          >
            <NavToggle className="text-2xl" toggled={collapsed} />
          </button>
          <div className="max-w-72 rounded-lg border border-gray-200 bg-white px-4 pb-4 dark:border-gray-700 dark:bg-gray-800">
            <Menu
              id="vitrine-menu-nav"
              aria-label="Menu de exemplo"
              defaultActiveKeys={[ATIVO]}
              sideCollapsed={collapsed}
            >
              <Menu.MenuGroup label="Áreas do site">
                {ITENS.map((item) => (
                  <Menu.MenuItem key={item.key} eventKey={item.key}>
                    <Link
                      href={item.href}
                      aria-current={item.key === ATIVO ? 'page' : undefined}
                      className="flex h-full w-full items-center gap-2"
                    >
                      <item.icon aria-hidden className="text-2xl" />
                      {!collapsed && <span>{item.title}</span>}
                      {collapsed && <span className="sr-only">{item.title}</span>}
                    </Link>
                  </Menu.MenuItem>
                ))}
              </Menu.MenuGroup>
            </Menu>
          </div>
        </div>
      </Card>
    </section>
  );
}
