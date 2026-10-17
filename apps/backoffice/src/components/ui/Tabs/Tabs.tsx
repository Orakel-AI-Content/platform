// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tabs/Tabs.tsx
// Adaptado (#213): gera o `baseId` dos ids de aba e painel com `useUniqueId` (estável no SSR).
'use client';

import { TabsContextProvider } from './context';
import useControllableState from '../hooks/useControllableState';
import useUniqueId from '../hooks/useUniqueId';
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';
import type { TabsVariant, TabsValue } from './context';
import type { Ref } from 'react';

export interface TabsProps extends CommonProps {
  defaultValue?: TabsValue;
  onChange?: (tabValue: TabsValue) => void;
  ref?: Ref<HTMLDivElement>;
  value?: TabsValue;
  variant?: TabsVariant;
}

const Tabs = (props: TabsProps) => {
  const {
    className,
    defaultValue,
    onChange,
    ref,
    value: valueProp,
    variant = 'underline',
    ...rest
  } = props;

  const baseId = useUniqueId('tabs');

  const [value, setValue] = useControllableState({
    prop: valueProp,
    onChange: onChange,
    defaultProp: defaultValue,
  });

  const tabsClass = classNames('tabs', className);

  return (
    <TabsContextProvider
      value={{
        baseId,
        value: value,
        onValueChange: setValue,
        variant,
      }}
    >
      <div className={tabsClass} {...rest} ref={ref} />
    </TabsContextProvider>
  );
};

export default Tabs;
