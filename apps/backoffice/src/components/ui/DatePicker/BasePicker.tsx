// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/BasePicker.tsx
// Adaptado (#318), pela acessibilidade:
// - Enter e Espaço no campo abrem o painel: o Ecme comparava `event.key` com `'Space'`, que nunca
//   chega (a tecla é `' '`);
// - sem o `useClick`: o clique no campo é o `handleInputClick`, que passa pelo
//   `getReferenceProps` com o `onKeyDown`; no Ecme, os do `useClick` os sobrescreviam (e, no
//   campo de texto, ele ignora o Espaço);
// - painel num `FloatingFocusManager` (não modal), como o DropdownMenu: aberto pelo teclado, o
//   foco vai para o painel; Esc fecha e o foco volta ao campo (no Ecme ficava no `<body>`);
// - o painel (`role="dialog"`, do `useRole`) leva o nome de `dropdownLabel`: no Ecme, o
//   `aria-labelledby` apontava para um id que não existia;
// - o botão de limpar chama-se `clearLabel` (o CloseButton diria "Fechar") e o ícone do
//   calendário fica `aria-hidden`;
// - o painel não herda o FormItem: o TimeInput dentro dele leria o `controlId` do campo e
//   repetiria o id.
'use client';

import {
  FloatingFocusManager,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useState } from 'react';
import { HiOutlineCalendar } from 'react-icons/hi';
import { Input } from '../Input';
import useMergedRef from '../hooks/useMergeRef';
import CloseButton from '../CloseButton';
import { FormItemContextProvider } from '../Form/context';
import type { CommonProps, TypeAttributes } from '../@types/common';
import type {
  ReactNode,
  FocusEvent,
  HTMLInputTypeAttribute,
  KeyboardEvent,
  MouseEvent,
  ChangeEvent,
  Ref,
} from 'react';

export interface BasePickerSharedProps {
  clearable?: boolean;
  clearButton?: string | ReactNode;
  clearLabel?: string;
  disabled?: boolean;
  dropdownLabel?: string;
  inputtable?: boolean;
  inputPrefix?: string | ReactNode;
  inputSuffix?: string | ReactNode;
  name?: string;
  onBlur?: (event: FocusEvent<HTMLInputElement, Element>) => void;
  onDropdownOpen?: () => void;
  onDropdownClose?: () => void;
  onFocus?: (event: FocusEvent<HTMLInputElement, Element>) => void;
  placeholder?: string;
  size?: TypeAttributes.ControlSize;
  type?: HTMLInputTypeAttribute;
}

interface BasePickerProps extends CommonProps, BasePickerSharedProps {
  dropdownOpened: boolean;
  inputtableBlurClose?: boolean;
  inputLabel?: string;
  lockView?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClear?: (event: MouseEvent<HTMLElement>) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  setDropdownOpened: (opened: boolean) => void;
  ref?: Ref<HTMLInputElement>;
}

const BasePicker = (props: BasePickerProps) => {
  const {
    className,
    clearable = true,
    clearButton,
    clearLabel = 'Limpar',
    children,
    disabled,
    dropdownLabel = 'Escolher data',
    dropdownOpened,
    inputtable,
    inputtableBlurClose = false,
    inputLabel,
    inputPrefix,
    inputSuffix = <HiOutlineCalendar aria-hidden className="text-lg" />,
    name,
    onDropdownOpen,
    onDropdownClose,
    onBlur,
    onFocus,
    onChange,
    onKeyDown,
    onClear,
    placeholder,
    ref = null,
    setDropdownOpened,
    size,
    type,
  } = props;

  // Aberto pelo teclado, o foco vai para o painel; pelo clique, fica no campo.
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);

  const handleInputClick = () => {
    setOpenedByKeyboard(false);
    if (inputtable) {
      openDropdown();
    } else {
      toggleDropdown(!dropdownOpened);
    }
  };

  const closeDropdown = () => {
    setDropdownOpened(false);
    onDropdownClose?.();
  };

  const suffixIconSlot = clearable ? (
    clearButton ? (
      <div role="presentation" onClick={onClear}>
        {clearButton}
      </div>
    ) : (
      <CloseButton className="text-base" aria-label={clearLabel} onClick={onClear} />
    )
  ) : inputSuffix ? (
    <>{inputSuffix}</>
  ) : null;

  const toggleDropdown = (open: boolean) => {
    setDropdownOpened(open);
    if (open) {
      onDropdownOpen?.();
    } else {
      onDropdownClose?.();
    }
  };

  const openDropdown = () => {
    setDropdownOpened(true);
    onDropdownOpen?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if ((event.key === ' ' || event.key === 'Enter') && !inputtable) {
      event.preventDefault();
      setOpenedByKeyboard(true);
      openDropdown();
    }
  };

  const handleInputBlur = (event: FocusEvent<HTMLInputElement, Element>) => {
    onBlur?.(event);
    if (inputtable && inputtableBlurClose) {
      closeDropdown();
    }
  };

  const handleInputFocus = (event: FocusEvent<HTMLInputElement, Element>) => {
    onFocus?.(event);
  };

  const { refs, floatingStyles, context } = useFloating({
    open: dropdownOpened,
    onOpenChange: toggleDropdown,
    placement: 'bottom-start',
    middleware: [
      offset(10),
      flip({
        fallbackAxisSideDirection: 'start',
      }),
      shift(),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Como no Tooltip: os setters dos `refs` como funções, pela regra `unbound-method`.
  const setReference = (node: HTMLElement | null) => refs.setReference(node);
  const setFloating = (node: HTMLElement | null) => refs.setFloating(node);

  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const inputRef = useMergedRef(ref, setReference);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    inputtable ? focus : undefined,
    dismiss,
    role,
  ]);

  return (
    <>
      <Input
        ref={inputRef}
        className={className}
        placeholder={placeholder}
        size={size}
        name={name}
        value={inputLabel}
        readOnly={!inputtable}
        suffix={suffixIconSlot}
        prefix={inputPrefix}
        autoComplete="off"
        type={type}
        disabled={disabled}
        asElement={'input'}
        onChange={onChange}
        {...getReferenceProps({
          onBlur: handleInputBlur,
          onFocus: handleInputFocus,
          onClick: handleInputClick,
          onKeyDown: handleKeyDown,
        })}
      />
      {dropdownOpened && (
        <FloatingFocusManager
          context={context}
          modal={false}
          initialFocus={openedByKeyboard ? 0 : -1}
          returnFocus
        >
          <div
            ref={setFloating}
            className="picker"
            style={floatingStyles}
            aria-label={dropdownLabel}
            {...getFloatingProps()}
          >
            <FormItemContextProvider value={null}>
              <div className="picker-panel">{children}</div>
            </FormItemContextProvider>
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
};

export default BasePicker;
