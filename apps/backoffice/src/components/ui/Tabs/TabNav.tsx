// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tabs/TabNav.tsx
// Adaptado (#213), pela acessibilidade (padrão de abas do APG):
// - <button role="tab"> no lugar da <div>: o Ecme dava `tabIndex=0` a todas as abas e ativava
//   com qualquer tecla. Aqui só a aba ativa entra no Tab (tabindex itinerante), Enter e Espaço
//   vêm do botão, e setas, Home e End movem o foco e ativam a aba, pulando as desabilitadas;
// - `id` e `aria-controls` ligam a aba ao painel; `disabled` nativo tira a aba do teclado;
// - cores da aba ativa substituídas onde não chegam a 4,5:1 (docs/migration/ecme.md):
//   `dark:text-primary-mild` no sublinhado e `dark:text-gray-950` na pílula.
'use client';

import classNames from '../utils/classNames';
import { tabIds, useTabs } from './context';
import useCallbackRef from '../hooks/useCallbackRef';
import type { CommonProps } from '../@types/common';
import type { TabsValue } from './context';
import type { KeyboardEvent, ReactNode, Ref } from 'react';

export interface TabNavProps extends CommonProps {
  disabled?: boolean;
  icon?: string | ReactNode;
  ref?: Ref<HTMLButtonElement>;
  value: TabsValue;
}

/** Próxima aba habilitada da mesma lista, conforme a tecla; `undefined` para outras teclas. */
function targetTab(current: HTMLElement, key: string): HTMLElement | undefined {
  const list = current.closest('[role="tablist"]');
  if (!list) return undefined;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]:not(:disabled)'));
  const index = tabs.indexOf(current);
  switch (key) {
    case 'ArrowRight':
      return tabs[(index + 1) % tabs.length];
    case 'ArrowLeft':
      return tabs[(index - 1 + tabs.length) % tabs.length];
    case 'Home':
      return tabs[0];
    case 'End':
      return tabs[tabs.length - 1];
    default:
      return undefined;
  }
}

const TabNav = (props: TabNavProps) => {
  const { value: valueProp, disabled, className, icon, children, ref, ...rest } = props;

  const { baseId, value, onValueChange, variant } = useTabs();
  const isSelected = valueProp === value;
  const ids = tabIds(baseId, valueProp);

  const onTabNavClick = useCallbackRef(() => {
    if (!isSelected && !disabled) {
      onValueChange?.(valueProp);
    }
  });

  const onTabNavKeyDown = useCallbackRef((event: KeyboardEvent<HTMLButtonElement>) => {
    const target = targetTab(event.currentTarget, event.key);
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.click();
  });

  const tabNavClass = classNames(
    'tab-nav',
    `tab-nav-${variant}`,
    isSelected && `tab-nav-active text-primary dark:text-primary-mild`,
    isSelected && variant === 'underline' && `border-primary`,
    isSelected && variant === 'pill' && `bg-primary text-neutral dark:text-gray-950`,
    disabled && 'tab-nav-disabled',
    !disabled && !isSelected && `hover:text-primary dark:hover:text-primary-mild`,
    className,
  );

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      id={ids.tab}
      className={tabNavClass}
      role="tab"
      aria-selected={isSelected}
      aria-controls={ids.panel}
      tabIndex={isSelected || value === undefined ? 0 : -1}
      disabled={disabled}
      onClick={onTabNavClick}
      onKeyDown={onTabNavKeyDown}
    >
      {icon && (
        <span aria-hidden className="tab-nav-icon">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
};

export default TabNav;
