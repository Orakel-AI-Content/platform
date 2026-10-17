// Ecme v1.3.10 (e5f9a1d): src/components/ui/InputGroup/Addon.tsx
// Adaptado (#207): o texto do complemento é `text-gray-600 dark:text-gray-100`, explícito; o
// Ecme herdava a cor do body, e o gray-400 do escuro sobre o gray-600 do complemento não chega
// a 4,5:1 (pares "complemento do campo" do globals-contrast.test.ts).
'use client';

import classNames from '../utils/classNames';
import { useConfig } from '../ConfigProvider';
import { useForm } from '../Form/context';
import { useInputGroup } from '../InputGroup/context';
import { CONTROL_SIZES } from '../utils/constants';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type { Ref } from 'react';

export interface AddonProps extends CommonProps {
  size?: TypeAttributes.ControlSize;
  ref?: Ref<HTMLDivElement>;
}

const Addon = ({ ref, ...props }: AddonProps) => {
  const { size, children, className } = props;

  const { controlSize } = useConfig();
  const formControlSize = useForm()?.size;
  const inputGroupSize = useInputGroup()?.size;

  const inputAddonSize = size || inputGroupSize || formControlSize || controlSize;

  const addonClass = classNames(
    'input-addon',
    `input-addon-${inputAddonSize} ${CONTROL_SIZES[inputAddonSize].h}`,
    'text-gray-600 dark:text-gray-100',
    className,
  );

  return (
    <div ref={ref} className={addonClass}>
      {children}
    </div>
  );
};

export default Addon;
