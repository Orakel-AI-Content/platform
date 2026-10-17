// Ecme v1.3.10 (e5f9a1d): src/components/ui/Checkbox/index.tsx
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import CheckboxBase, { type CheckboxProps } from './Checkbox';
import CheckboxGroup from './Group';

export type { CheckboxProps } from './Checkbox';
export type { CheckboxGroupProps } from './Group';
export type { CheckboxGroupValue, CheckboxValue } from './context';

type CompoundedComponent = ForwardRefExoticComponent<
  CheckboxProps & RefAttributes<HTMLInputElement>
> & {
  Group: typeof CheckboxGroup;
};

const Checkbox = CheckboxBase as CompoundedComponent;

Checkbox.Group = CheckboxGroup;

export { Checkbox };

export default Checkbox;
