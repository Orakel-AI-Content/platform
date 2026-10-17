// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tabs/TabContent.tsx
// Adaptado (#213): o painel leva `id` e `aria-labelledby` da sua aba, e o inativo fica `hidden`
// (no Ecme ficava vazio e focável, uma parada de Tab sem conteúdo).
'use client';

import classNames from '../utils/classNames';
import { tabIds, useTabs } from './context';
import type { CommonProps } from '../@types/common';
import type { TabsValue } from './context';
import type { Ref } from 'react';

export interface TabContentProps extends CommonProps {
  ref?: Ref<HTMLDivElement>;
  value: TabsValue;
}

const TabContent = (props: TabContentProps) => {
  const { value, children, className, ref, ...rest } = props;

  const context = useTabs();
  const isSelected = value === context.value;
  const ids = tabIds(context.baseId, value);

  const tabContentClass = classNames('tab-content', isSelected && 'tab-content-active', className);

  return (
    <div
      {...rest}
      ref={ref}
      id={ids.panel}
      role="tabpanel"
      aria-labelledby={ids.tab}
      hidden={!isSelected}
      tabIndex={0}
      className={tabContentClass}
    >
      {isSelected && children}
    </div>
  );
};

export default TabContent;
