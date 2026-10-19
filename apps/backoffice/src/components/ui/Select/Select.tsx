// Ecme v1.3.10 (e5f9a1d): src/components/ui/Select/Select.tsx
// Adaptado (#208):
// - dentro de um FormItem, o combobox usa o id que o rótulo aponta (`inputId` = `controlId`)
//   e, inválido, recebe `aria-invalid` e `aria-errormessage` (o id da mensagem); o Ecme só
//   trocava a classe;
// - `instanceId` do `useUniqueId` (`useId`), o mesmo no servidor e no navegador, para os ids
//   do `react-select` não divergirem na hidratação;
// - placeholder em gray-600 e gray-300, também no inválido (pares "placeholder do campo" do
//   globals-contrast.test.ts); o `text-gray-400` e o `text-error` do Ecme ficam abaixo de 4,5:1;
// - o indicador de carregamento usa `text-primary`: o `text-${themeColor}` do Ecme é montado
//   em tempo de execução e não sai no CSS do Tailwind;
// - ícones dos indicadores `aria-hidden`; `componentAs` e `field` com tipos sem `any`.
// Adaptado (#319):
// - no múltiplo, o botão de remover do valor se chama "Remover <opção>" (o react-select diz
//   "Remove <opção>"), e a região viva anuncia em pt-BR (seleção, remoção, foco no valor,
//   resultados e guias de teclado); o valor em foco pelas setas ganha
//   `select-multi-value-focused` (o Ecme não o distinguia); quem passar `components.MultiValueRemove`,
//   `ariaLiveMessages` ou `screenReaderStatus` vence o padrão.
'use client';

import { useMemo } from 'react';
import cn from '../utils/classNames';
import ReactSelect, { components as selectComponents } from 'react-select';
import type CreatableSelect from 'react-select/creatable';
import type AsyncSelect from 'react-select/async';
import { useConfig } from '../ConfigProvider';
import { useForm, useFormItem } from '../Form/context';
import { useInputGroup } from '../InputGroup/context';
import useUniqueId from '../hooks/useUniqueId';
import { HiChevronDown, HiX } from 'react-icons/hi';
import DefaultOption from './Option';
import Spinner from '../Spinner/Spinner';
import { CONTROL_SIZES } from '../utils/constants';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type {
  AriaLiveMessages,
  ClearIndicatorProps,
  MultiValueRemoveProps,
  Props as ReactSelectProps,
  GroupBase,
} from 'react-select';
import type { AsyncProps } from 'react-select/async';
import type { CreatableProps } from 'react-select/creatable';

const DefaultDropdownIndicator = () => {
  return (
    <div className="select-dropdown-indicator">
      <HiChevronDown aria-hidden />
    </div>
  );
};

const DefaultClearIndicator = <Option, IsMulti extends boolean, Group extends GroupBase<Option>>({
  innerProps,
}: ClearIndicatorProps<Option, IsMulti, Group>) => {
  return (
    <div {...innerProps}>
      <div className="select-clear-indicator">
        <HiX aria-hidden />
      </div>
    </div>
  );
};

const DefaultMultiValueRemove = <Option, IsMulti extends boolean, Group extends GroupBase<Option>>(
  props: MultiValueRemoveProps<Option, IsMulti, Group>,
) => {
  const { data, innerProps, selectProps } = props;
  return (
    <selectComponents.MultiValueRemove
      {...props}
      innerProps={{ ...innerProps, 'aria-label': `Remover ${selectProps.getOptionLabel(data)}` }}
    />
  );
};

/** Posição "n de total" para a região viva; vazia sem lista. */
const position = <T,>(list: readonly T[] | undefined, item: T) =>
  list && list.length ? `${list.indexOf(item) + 1} de ${list.length}` : '';

/** As mensagens da região viva do react-select, em pt-BR. */
function ariaLiveMessagesPtBr<
  Option,
  IsMulti extends boolean,
  Group extends GroupBase<Option>,
>(): AriaLiveMessages<Option, IsMulti, Group> {
  return {
    guidance: ({ context, isSearchable, isMulti, tabSelectsValue, isInitialFocus, ...props }) => {
      switch (context) {
        case 'menu':
          return `Use as setas para cima e para baixo para escolher, Enter para selecionar a opção em foco e Esc para sair do menu${tabSelectsValue ? ', Tab para selecionar a opção e sair do menu' : ''}.`;
        case 'input':
          return isInitialFocus
            ? `${props['aria-label'] || 'Seleção'} em foco${isSearchable ? ', digite para filtrar a lista' : ''}, seta para baixo abre o menu${isMulti ? ', seta para a esquerda leva aos valores escolhidos' : ''}.`
            : '';
        case 'value':
          return 'Use as setas para a esquerda e para a direita para passar pelos valores escolhidos e Backspace para remover o valor em foco.';
        default:
          return '';
      }
    },
    onChange: ({ action, label = '', labels, isDisabled }) => {
      switch (action) {
        case 'deselect-option':
        case 'pop-value':
        case 'remove-value':
          return `opção ${label} removida.`;
        case 'clear':
          return 'Todas as opções escolhidas foram removidas.';
        case 'initial-input-focus':
          return labels.length > 1
            ? `opções ${labels.join(', ')} selecionadas.`
            : `opção ${labels.join(', ')} selecionada.`;
        case 'select-option':
          return isDisabled
            ? `opção ${label} desabilitada. Escolha outra opção.`
            : `opção ${label} selecionada.`;
        default:
          return '';
      }
    },
    onFocus: ({
      context,
      focused,
      options,
      label = '',
      selectValue,
      isDisabled,
      isSelected,
      isAppleDevice,
    }) => {
      if (context === 'value' && selectValue) {
        return `valor ${label} em foco, ${position(selectValue, focused)}.`;
      }
      if (context === 'menu' && isAppleDevice) {
        const status = `${isSelected ? ' selecionada' : ''}${isDisabled ? ' desabilitada' : ''}`;
        return `${label}${status}, ${position(options, focused)}.`;
      }
      return '';
    },
    onFilter: ({ inputValue, resultsMessage }) =>
      `${resultsMessage}${inputValue ? ` para a busca ${inputValue}` : ''}.`,
  };
}

const screenReaderStatusPtBr = ({ count }: { count: number }) =>
  count === 1 ? '1 resultado disponível' : `${count} resultados disponíveis`;

const DefaultLoadingIndicator = () => {
  return <Spinner className="select-loading-indicatior text-primary" />;
};

export type SelectProps<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
> = CommonProps &
  ReactSelectProps<Option, IsMulti, Group> &
  AsyncProps<Option, IsMulti, Group> &
  CreatableProps<Option, IsMulti, Group> & {
    invalid?: boolean;
    size?: TypeAttributes.ControlSize;
    /** Props de um campo controlado (ex.: o `field` do `Controller` do react-hook-form). */
    field?: Record<string, unknown>;
    componentAs?: typeof ReactSelect | typeof CreatableSelect | typeof AsyncSelect;
  };

function Select<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(props: SelectProps<Option, IsMulti, Group>) {
  const {
    components,
    componentAs: Component = ReactSelect,
    size,
    styles,
    className,
    classNames,
    field,
    invalid,
    inputId,
    instanceId,
    'aria-invalid': ariaInvalid,
    'aria-errormessage': ariaErrorMessage,
    ariaLiveMessages,
    screenReaderStatus,
    ...rest
  } = props;

  const liveMessages = useMemo(
    () => ({ ...ariaLiveMessagesPtBr<Option, IsMulti, Group>(), ...ariaLiveMessages }),
    [ariaLiveMessages],
  );

  const { controlSize } = useConfig();
  const formControlSize = useForm()?.size;
  const formItem = useFormItem();
  const inputGroupSize = useInputGroup()?.size;
  const generatedInstanceId = useUniqueId('select-');

  const selectSize = (size ||
    inputGroupSize ||
    formControlSize ||
    controlSize) as keyof typeof CONTROL_SIZES;

  const isSelectInvalid = invalid || formItem?.invalid;

  const selectClass = cn(`select select-${selectSize}`, className);

  return (
    <Component<Option, IsMulti, Group>
      className={selectClass}
      classNames={{
        control: (state) =>
          cn(
            'select-control',
            CONTROL_SIZES[selectSize].minH,
            state.isDisabled && 'opacity-50 cursor-not-allowed',
            (() => {
              const classes: string[] = ['bg-gray-100 dark:bg-gray-700'];

              const { isFocused } = state;

              if (isFocused) {
                classes.push(
                  'select-control-focused ring-1 ring-primary border-primary bg-transparent',
                );
              }

              if (isSelectInvalid) {
                classes.push('select-control-invalid bg-error-subtle');
              }

              if (isFocused && isSelectInvalid) {
                classes.push('ring-error border-error');
              }

              return classes;
            })(),
          ),
        valueContainer: ({ isMulti, hasValue, selectProps }) =>
          cn(
            'select-value-container',
            isMulti && hasValue && selectProps.controlShouldRenderValue ? 'flex' : 'grid',
          ),
        input: ({ value, isDisabled }) =>
          cn(
            'select-input-container',
            isDisabled ? 'invisible' : 'visible',
            value && '[transform:translateZ(0)]',
          ),
        placeholder: () => cn('select-placeholder', 'text-gray-600 dark:text-gray-300'),
        indicatorsContainer: () => 'select-indicators-container',
        singleValue: () => 'select-single-value',
        multiValue: ({ isFocused }) =>
          cn('select-multi-value', isFocused && 'select-multi-value-focused'),
        multiValueLabel: () => 'select-multi-value-label',
        multiValueRemove: () => 'select-multi-value-remove',
        menu: () => 'select-menu',
        ...classNames,
      }}
      classNamePrefix={'select'}
      styles={{
        control: () => ({}),
        valueContainer: () => ({}),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        input: ({ margin, paddingTop, paddingBottom, ...provided }) => ({ ...provided }),
        placeholder: () => ({}),
        singleValue: () => ({}),
        multiValue: () => ({}),
        multiValueLabel: () => ({}),
        multiValueRemove: () => ({}),
        menu: ({
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          backgroundColor,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          marginTop,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          marginBottom,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          border,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          borderRadius,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          boxShadow,
          ...provided
        }) => ({ ...provided, zIndex: 50 }),
        ...styles,
      }}
      components={{
        IndicatorSeparator: () => null,
        Option: DefaultOption,
        LoadingIndicator: DefaultLoadingIndicator,
        DropdownIndicator: DefaultDropdownIndicator,
        ClearIndicator: DefaultClearIndicator,
        MultiValueRemove: DefaultMultiValueRemove,
        ...components,
      }}
      ariaLiveMessages={liveMessages}
      screenReaderStatus={screenReaderStatus ?? screenReaderStatusPtBr}
      inputId={inputId ?? formItem?.controlId}
      instanceId={instanceId ?? generatedInstanceId}
      aria-invalid={isSelectInvalid ? true : ariaInvalid}
      aria-errormessage={
        isSelectInvalid ? (formItem?.errorId ?? ariaErrorMessage) : ariaErrorMessage
      }
      {...field}
      {...rest}
    />
  );
}

export default Select;
