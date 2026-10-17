// Ecme v1.3.10 (e5f9a1d): src/components/ui/Tabs/index.tsx
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import TabsBase, { type TabsProps } from './Tabs';
import TabList from './TabList';
import TabNav from './TabNav';
import TabContent from './TabContent';

export type { TabsProps } from './Tabs';
export type { TabListProps } from './TabList';
export type { TabNavProps } from './TabNav';
export type { TabContentProps } from './TabContent';
export type { TabsValue, TabsVariant } from './context';

type CompoundedComponent = ForwardRefExoticComponent<TabsProps & RefAttributes<HTMLDivElement>> & {
  TabList: typeof TabList;
  TabNav: typeof TabNav;
  TabContent: typeof TabContent;
};

const Tabs = TabsBase as CompoundedComponent;

Tabs.TabList = TabList;
Tabs.TabNav = TabNav;
Tabs.TabContent = TabContent;

export { Tabs };

export default Tabs;
