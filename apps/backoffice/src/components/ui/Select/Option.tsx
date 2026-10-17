// Ecme v1.3.10 (e5f9a1d): src/components/ui/Select/Option.tsx
// Adaptado (#208): a opção em foco pelo teclado (`isFocused`) ganha `select-option-focused`; no
// Ecme, navegar por setas não mudava nada na tela. O ícone de escolhida fica `aria-hidden`: o
// estado vem do `aria-selected` do `react-select`.
'use client';

import classNames from '../utils/classNames';
import { HiCheck } from 'react-icons/hi';
import type { ReactNode } from 'react';
import type { GroupBase, OptionProps as ReactSelectOptionProps } from 'react-select';

type DefaultOptionProps<T> = {
  customLabel?: (data: T, label: string) => ReactNode;
};

const Option = <T, IsMulti extends boolean = boolean, Group extends GroupBase<T> = GroupBase<T>>(
  props: ReactSelectOptionProps<T, IsMulti, Group> & DefaultOptionProps<T>,
) => {
  const { innerProps, label, isSelected, isDisabled, isFocused, data, customLabel } = props;

  return (
    <div
      className={classNames(
        'select-option',
        isFocused && !isDisabled && 'select-option-focused',
        !isDisabled && !isSelected && 'hover:text-gray-800 dark:hover:text-gray-100',
        isSelected && 'text-primary bg-primary-subtle',
        isDisabled && 'opacity-50 cursor-not-allowed',
      )}
      {...innerProps}
    >
      {customLabel ? customLabel(data, label) : <span className="ml-2">{label}</span>}
      {isSelected && <HiCheck aria-hidden className="text-xl" />}
    </div>
  );
};

export default Option;
