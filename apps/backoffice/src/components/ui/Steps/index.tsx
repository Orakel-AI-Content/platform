// Ecme v1.3.10 (e5f9a1d): src/components/ui/Steps/index.tsx
// Adaptado (#321): o `ref` do Steps é do <ol>.
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import StepsBase, { type StepsProps } from './Steps';
import StepItem from './StepItem';

export type { StepsProps } from './Steps';
export type { StepItemProps } from './StepItem';

type CompoundedComponent = ForwardRefExoticComponent<
  StepsProps & RefAttributes<HTMLOListElement>
> & {
  Item: typeof StepItem;
};

const Steps = StepsBase as CompoundedComponent;

Steps.Item = StepItem;

export { Steps };

export default Steps;
