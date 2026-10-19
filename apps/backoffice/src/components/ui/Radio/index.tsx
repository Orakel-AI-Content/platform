// Ecme v1.3.10 (e5f9a1d): src/components/ui/Radio/index.tsx
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import RadioBase, { type RadioProps } from './Radio';
import Group from './Group';

export type { RadioProps } from './Radio';
export type { RadioGroupProps } from './Group';
export type { RadioValue } from './context';

type CompoundedComponent = ForwardRefExoticComponent<
  RadioProps & RefAttributes<HTMLInputElement>
> & {
  Group: typeof Group;
};

const Radio = RadioBase as CompoundedComponent;

Radio.Group = Group;

export { Radio };

export default Radio;
