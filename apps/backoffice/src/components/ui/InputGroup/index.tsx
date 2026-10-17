// Ecme v1.3.10 (e5f9a1d): src/components/ui/InputGroup/index.tsx
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import InputGroupBase, { type InputGroupProps } from './InputGroup';
import Addon from './Addon';

export type { InputGroupProps } from './InputGroup';
export type { AddonProps } from './Addon';

type CompoundedComponent = ForwardRefExoticComponent<
  InputGroupProps & RefAttributes<HTMLDivElement>
> & {
  Addon: typeof Addon;
};

const InputGroup = InputGroupBase as CompoundedComponent;

InputGroup.Addon = Addon;

export { InputGroup };

export default InputGroup;
