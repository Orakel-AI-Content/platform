// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/DateTimepicker.tsx
// Adaptado (#318):
// - prop `timeZone` (fuso IANA do site, `SiteSummary.timeZone`): `value`, `defaultValue` e o
//   `onChange` são instantes; o campo, o calendário e o TimeInput mostram a hora de parede do
//   fuso, e a hora escolhida volta como o instante dela no fuso (`fromZonedDate`, que na troca de
//   horário segue a regra `compatible`). Sem `timeZone`, como no Ecme: fuso do navegador;
// - padrões em pt-BR, 24 h: `amPm` falso, `inputFormat` `DD/MM/YYYY HH:mm`, painel "Escolher data
//   e hora" e botão de limpar "Limpar data e hora";
// - `okButtonContent` tipado como conteúdo (no Ecme, `boolean` com padrão `'OK'`);
// - o dia escolhido sem valor anterior leva a hora de agora no fuso do site, e com valor, a hora
//   dele (no Ecme, `setHours` no `Date` local);
// - `inputtable` chega ao BasePicker (no Ecme, era desestruturado e não repassado); o texto
//   digitado é lido no fuso do navegador, como no Ecme.
// - o OK é `type="button"`: dentro de um formulário, fecha o painel sem enviá-lo (no Ecme, sem
//   `type`, era `submit`).
'use client';

import 'dayjs/locale/pt-br';
import { useRef, useState } from 'react';
import dayjs from 'dayjs';
import useControllableState from '../hooks/useControllableState';
import useMergedRef from '../hooks/useMergeRef';
import TimeInput from '../TimeInput/TimeInput';
import Calendar from './Calendar';
import BasePicker from './BasePicker';
import Button from '../Button/Button';
import { useConfig } from '../ConfigProvider';
import { capitalize, fromZonedDate, toZonedDate } from './utils';
import type { CommonProps } from '../@types/common';
import type { CalendarSharedProps } from './CalendarBase';
import type { BasePickerSharedProps } from './BasePicker';
import type { FocusEvent, ChangeEvent, ReactNode, Ref } from 'react';

export interface DateTimepickerProps
  extends
    CommonProps,
    Omit<
      CalendarSharedProps,
      | 'onMonthChange'
      | 'onChange'
      | 'isDateInRange'
      | 'isDateFirstInRange'
      | 'isDateLastInRange'
      | 'month'
    >,
    BasePickerSharedProps {
  closePickerOnChange?: boolean;
  defaultOpen?: boolean;
  defaultValue?: Date | null;
  value?: Date | null;
  inputFormat?: string;
  openPickerOnClear?: boolean;
  onChange?: (value: Date | null) => void;
  ref?: Ref<HTMLInputElement>;
  amPm?: boolean;
  okButtonContent?: ReactNode;
}

const DEFAULT_INPUT_FORMAT = 'DD/MM/YYYY HH:mm';

const DateTimepicker = (props: DateTimepickerProps) => {
  const {
    amPm = false,
    className,
    clearable = true,
    clearLabel = 'Limpar data e hora',
    closePickerOnChange = false,
    dateViewCount,
    dayClassName,
    dayStyle,
    defaultMonth,
    defaultOpen = false,
    defaultValue,
    defaultView,
    disabled = false,
    disableDate,
    dropdownLabel = 'Escolher data e hora',
    enableHeaderLabel,
    disableOutOfMonth,
    firstDayOfWeek = 'monday',
    hideOutOfMonthDates,
    hideWeekdays,
    inputFormat,
    inputPrefix,
    inputSuffix,
    inputtable,
    labelFormat = {
      month: 'MMM',
      year: 'YYYY',
    },
    locale,
    lockView,
    maxDate,
    minDate,
    name = 'dateTime',
    okButtonContent = 'OK',
    onBlur,
    onChange,
    onFocus,
    onDropdownClose,
    onDropdownOpen,
    openPickerOnClear,
    ref = null,
    renderDay,
    size,
    timeZone,
    value,
    weekendDays,
    yearLabelFormat,
    ...rest
  } = props;

  const { locale: themeLocale } = useConfig();

  const finalLocale = locale || themeLocale;

  const dateFormat = inputFormat || DEFAULT_INPUT_FORMAT;

  /** Instante → hora de parede do fuso do site (sem fuso, o próprio instante). */
  const zoned = (date: Date) => toZonedDate(date, timeZone);

  const formatDate = (date: Date) =>
    capitalize(dayjs(zoned(date)).locale(finalLocale).format(dateFormat));

  const [dropdownOpened, setDropdownOpened] = useState(defaultOpen);

  const inputRef = useRef<HTMLInputElement>(null);

  const [, setLastValidValue] = useState(defaultValue ?? null);
  const [_value, setValue] = useControllableState({
    prop: value,
    defaultProp: defaultValue,
    onChange,
  });

  const [calendarMonth, setCalendarMonth] = useState(() =>
    _value ? zoned(_value) : defaultMonth || zoned(new Date()),
  );

  const [focused, setFocused] = useState(false);
  // Valor controlado (prop `value`) prevalece já no primeiro render,
  // como fazia o efeito de sincronização no mount
  const [inputState, setInputState] = useState(() => {
    if (value === null) {
      return '';
    }
    if (value instanceof Date) {
      return formatDate(value);
    }
    return _value instanceof Date ? formatDate(_value) : '';
  });

  const closeDropdown = () => {
    setDropdownOpened(false);
    onDropdownClose?.();
  };

  const openDropdown = () => {
    setDropdownOpened(true);
    onDropdownOpen?.();
  };

  // Sincroniza o texto com a prop durante o render (sem efeito em cascata)
  const [prevDeps, setPrevDeps] = useState({ value, focused });
  if (prevDeps.value !== value || prevDeps.focused !== focused) {
    setPrevDeps({ value, focused });
    if (value === null && !focused) {
      setInputState('');
    }
    if (value instanceof Date && !focused) {
      setInputState(formatDate(value));
    }
  }

  /** Dia da grade (hora de parede) com a hora e o minuto de `time` → instante no fuso. */
  const atTime = (day: Date, time: Date) =>
    fromZonedDate(
      new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        time.getHours(),
        time.getMinutes(),
      ),
      timeZone,
    );

  const handleValueChange = (date: Date | null) => {
    if (!date) return;
    const newDate = atTime(zoned(date), zoned(_value ?? new Date(Date.now())));
    setValue(newDate);
    if (!value && !closePickerOnChange) {
      setInputState(formatDate(newDate));
    }
    if (closePickerOnChange) {
      setInputState(formatDate(newDate));
      closeDropdown();
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleClear = () => {
    setValue(null);
    setLastValidValue(null);
    setInputState('');
    if (openPickerOnClear) {
      openDropdown();
    }
    inputRef.current?.focus();
    onChange?.(null);
  };

  const parseDate = (date: string) => dayjs(date, dateFormat, finalLocale).toDate();

  const handleInputBlur = (event: FocusEvent<HTMLInputElement, Element>) => {
    onBlur?.(event);
    setFocused(false);
  };

  const handleInputFocus = (event: FocusEvent<HTMLInputElement, Element>) => {
    onFocus?.(event);
    setFocused(true);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    openDropdown();

    const date = parseDate(event.target.value);
    if (dayjs(date).isValid()) {
      setValue(date);
      setLastValidValue(date);
      if (closePickerOnChange) {
        setInputState(event.target.value);
      }
      setCalendarMonth(date);
    } else if (closePickerOnChange) {
      setInputState(event.target.value);
    }
  };

  const handleTimeChange = (time: Date | null) => {
    if (_value instanceof Date && time instanceof Date) {
      const day = zoned(_value);
      const newDateTime = fromZonedDate(
        new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          time.getHours(),
          time.getMinutes(),
          time.getSeconds(),
          time.getMilliseconds(),
        ),
        timeZone,
      );
      setValue(newDateTime);

      if (!value || closePickerOnChange) {
        setInputState(formatDate(newDateTime));
      }
    }
    if (closePickerOnChange) {
      closeDropdown();
    }
  };

  const handleOk = () => {
    if (_value) {
      setInputState(formatDate(_value));
    }
    closeDropdown();
    window.setTimeout(() => inputRef.current?.focus(), 0);
    onChange?.(_value ?? null);
  };

  return (
    <BasePicker
      ref={useMergedRef(ref, inputRef)}
      dropdownOpened={dropdownOpened}
      setDropdownOpened={setDropdownOpened}
      className={className}
      name={name}
      inputLabel={inputState}
      clearable={clearable && !!_value && !disabled}
      clearLabel={clearLabel}
      disabled={disabled}
      dropdownLabel={dropdownLabel}
      size={size}
      inputPrefix={inputPrefix}
      inputSuffix={inputSuffix}
      inputtable={inputtable}
      onChange={handleChange}
      onBlur={handleInputBlur}
      onFocus={handleInputFocus}
      onClear={handleClear}
      onDropdownClose={onDropdownClose}
      onDropdownOpen={onDropdownOpen}
      {...rest}
    >
      <Calendar
        locale={finalLocale}
        month={inputtable ? calendarMonth : undefined}
        defaultMonth={defaultMonth || zoned(_value instanceof Date ? _value : new Date())}
        value={_value instanceof Date ? _value : _value && dayjs(_value).toDate()}
        labelFormat={labelFormat}
        dayClassName={dayClassName}
        dayStyle={dayStyle}
        disableOutOfMonth={disableOutOfMonth}
        minDate={minDate}
        maxDate={maxDate}
        disableDate={disableDate}
        firstDayOfWeek={firstDayOfWeek}
        preventFocus={false}
        dateViewCount={dateViewCount}
        enableHeaderLabel={enableHeaderLabel}
        defaultView={defaultView}
        hideOutOfMonthDates={hideOutOfMonthDates}
        hideWeekdays={hideWeekdays}
        renderDay={renderDay}
        timeZone={timeZone}
        weekendDays={weekendDays}
        yearLabelFormat={yearLabelFormat}
        lockView={lockView}
        onMonthChange={setCalendarMonth}
        onChange={handleValueChange}
      />
      <div className="flex items-center gap-4 mt-4">
        <TimeInput
          disabled={!_value}
          value={_value ? zoned(_value) : _value}
          format={amPm ? '12' : '24'}
          clearable={false}
          size="sm"
          onChange={handleTimeChange}
        />
        <Button type="button" size="sm" disabled={!_value} onClick={handleOk}>
          {okButtonContent}
        </Button>
      </div>
    </BasePicker>
  );
};

DateTimepicker.displayName = 'DateTimepicker';

export default DateTimepicker;
