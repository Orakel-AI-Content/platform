// Ecme v1.3.10 (e5f9a1d): src/components/ui/Menu/MenuGroup.tsx
// Adaptado (#235), pela acessibilidade: a <ul> é nomeada pelo rótulo (`aria-labelledby`), e o
// contexto do grupo avisa os itens para virarem <li> (o Ecme punha <div> na <ul>). Recolhido
// (`sideCollapsed`), o rótulo some como no Ecme, e a lista fica sem nome.
'use client';

import { useContext } from 'react';
import classNames from '../utils/classNames';
import useUniqueId from '../hooks/useUniqueId';
import { GroupContextProvider } from './context/groupContext';
import MenuContext from './context/menuContext';
import type { CommonProps } from '../@types/common';
import type { ReactNode } from 'react';

export interface MenuGroupProps extends CommonProps {
  label: string | ReactNode;
}

const MenuGroup = (props: MenuGroupProps) => {
  const { label, children, className } = props;

  const { sideCollapsed } = useContext(MenuContext);
  const labelId = useUniqueId('menu-group-');

  const menuGroupDefaultClass = 'menu-group';
  const menuGroupClass = classNames(menuGroupDefaultClass, className);
  const showLabel = Boolean(label) && !sideCollapsed;

  return (
    <div className={menuGroupClass}>
      {showLabel && (
        <div id={labelId} className={classNames('menu-title')}>
          {label}
        </div>
      )}
      <GroupContextProvider value={true}>
        <ul aria-labelledby={showLabel ? labelId : undefined}>{children}</ul>
      </GroupContextProvider>
    </div>
  );
};

MenuGroup.displayName = 'MenuGroup';

export default MenuGroup;
