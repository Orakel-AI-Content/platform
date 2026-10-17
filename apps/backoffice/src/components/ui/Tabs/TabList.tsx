// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tabs/TabList.tsx
// Adaptado (#213): aceita `aria-label` e `aria-labelledby`, para dar nome à lista de abas.
'use client';

import classNames from '../utils/classNames';
import { useTabs } from './context';
import type { CommonProps } from '../@types/common';
import type { HTMLAttributes, Ref } from 'react';

export type TabListProps = CommonProps &
  Pick<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'aria-labelledby'> & {
    ref?: Ref<HTMLDivElement>;
  };

const TabList = (props: TabListProps) => {
  const { className, children, ref, ...rest } = props;

  const { variant } = useTabs();

  const tabListClass = classNames('tab-list', `tab-list-${variant}`, className);

  return (
    <div ref={ref} role="tablist" className={tabListClass} {...rest}>
      {children}
    </div>
  );
};

export default TabList;
