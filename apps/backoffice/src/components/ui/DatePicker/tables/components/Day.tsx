// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/components/Day.tsx
// Adaptado (#317):
// - pela acessibilidade, o nome do dia é a data por extenso no locale ("19 de outubro de 2026",
//   com `Intl`, porque o `LL` do dayjs pede plugin), não só o número; o selecionado expõe
//   `aria-pressed` e o de hoje, `aria-current="date"`;
// - selecionado no escuro com `dark:text-gray-950`, como o Button solid, pelo contraste;
// - `hidden` no lugar do `d-none`, que não existe no Tailwind nem no Ecme;
// - sem as classes de intervalo (fundo `primary-subtle`, pontas e hoje no intervalo): sem
//   `getRangeProps` e sem o RangeCalendar, nenhuma tela marca intervalo.
import classNames from '../../../utils/classNames';
import type { ComponentPropsWithRef, ReactNode, MouseEvent, Ref } from 'react';
import type { CommonProps } from '../../../@types/common';

export interface DayProps
  extends CommonProps, Omit<ComponentPropsWithRef<'button'>, 'value' | 'onMouseEnter'> {
  value: Date;
  locale: string;
  selected: boolean;
  weekend: boolean;
  outOfMonth: boolean;
  onMouseEnter: (date: Date, event: MouseEvent<HTMLButtonElement>) => void;
  hasValue: boolean;
  inRange: boolean;
  firstInRange: boolean;
  lastInRange: boolean;
  isToday: boolean;
  fullWidth: boolean;
  firstInMonth: boolean;
  focusable: boolean;
  hideOutOfMonthDates?: boolean;
  ref?: Ref<HTMLButtonElement>;
  renderDay?: (date: Date) => ReactNode;
  disabled: boolean;
}

function getDayTabIndex({
  focusable,
  hasValue,
  selected,
  firstInMonth,
}: {
  focusable: boolean;
  hasValue: boolean;
  selected: boolean;
  firstInMonth: boolean;
}) {
  if (!focusable) {
    return -1;
  }

  if (hasValue) {
    return selected ? 0 : -1;
  }

  return firstInMonth ? 0 : -1;
}

const Day = (props: DayProps) => {
  const {
    className,
    value,
    locale,
    selected,
    weekend,
    outOfMonth,
    onMouseEnter,
    hasValue,
    firstInRange,
    lastInRange,
    inRange,
    isToday,
    firstInMonth,
    focusable,
    hideOutOfMonthDates,
    ref,
    renderDay,
    disabled,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fullWidth,
    ...others
  } = props;

  return (
    <button
      {...others}
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(value)}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      tabIndex={getDayTabIndex({
        focusable,
        hasValue,
        selected,
        firstInMonth,
      })}
      className={classNames(
        'date-picker-cell-content',
        disabled && 'date-picker-cell-disabled',
        isToday && `ring-1 ring-inset ring-primary`,
        weekend && !disabled && 'date-picker-cell-weekend',
        outOfMonth && !disabled && 'date-picker-other-month',
        outOfMonth && hideOutOfMonthDates && 'hidden',
        !outOfMonth && !disabled && !selected && 'date-picker-cell-current-month',
        !disabled && !selected && !inRange && 'date-picker-cell-hoverable',
        selected &&
          !disabled &&
          'date-picker-cell-selected bg-primary text-neutral dark:text-gray-950',
        !inRange && !firstInRange && !lastInRange && 'rounded-full',
        className,
      )}
      onMouseEnter={(event) => onMouseEnter(value, event)}
    >
      {typeof renderDay === 'function' ? renderDay(value) : value?.getDate()}
    </button>
  );
};

export default Day;
