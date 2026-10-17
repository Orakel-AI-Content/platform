// Ecme v1.3.10 (e5f9a1d): src/components/template/SideNavToggle.tsx
// Adaptado (#238): um <button> nativo (o Ecme usava <div role="button">, fora do Tab e sem
// Espaço), com nome fixo, `aria-expanded` e `aria-controls` apontando a barra; o estado vem do
// contexto da moldura (`useSideNav`), não do `themeStore`. Sem `useResponsive` nem
// `withHeaderItem`: aparece em todas as larguras até o Drawer do celular (#242).
'use client';

import NavToggle from '@/components/shared/NavToggle';
import classNames from '@/components/ui/utils/classNames';
import type { CommonProps } from '@/components/ui/@types/common';
import { SIDE_NAV_ID, useSideNav } from './side-nav-context';

const SideNavToggle = ({ className }: CommonProps) => {
  const { collapsed, setCollapsed } = useSideNav();

  return (
    <button
      type="button"
      aria-label="Navegação lateral"
      aria-expanded={!collapsed}
      aria-controls={SIDE_NAV_ID}
      className={classNames(
        'header-action-item header-action-item-hoverable text-gray-600 dark:text-gray-400',
        className,
      )}
      onClick={() => setCollapsed(!collapsed)}
    >
      <NavToggle className="text-2xl" toggled={collapsed} />
    </button>
  );
};

export default SideNavToggle;
