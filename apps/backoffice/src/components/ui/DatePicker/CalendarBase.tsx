// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/CalendarBase.tsx
// Adaptado (#317):
// - prop `timeZone` (fuso IANA do site): o mês aberto por padrão é o de hoje no fuso do site, e o
//   fuso segue à tabela de dias, que marca "hoje" nele;
// - sem `range` (o cálculo de intervalo e o RangeCalendar não foram portados);
// - carrega o locale pt-br do dayjs, o padrão do ConfigProvider no Backoffice.
'use client';

import 'dayjs/locale/pt-br';
import { useRef, useState } from 'react';
import classNames from '../utils/classNames';
import useControllableState from '../hooks/useControllableState';
import { useConfig } from '../ConfigProvider';
import DateTable from './tables/DateTable';
import MonthTable from './tables/MonthTable';
import YearTable from './tables/YearTable';
import { toZonedDate } from './utils';
import type { CommonProps } from '../@types/common';
import type { MonthBaseProps } from './tables/components/Month';
import type { DayKeydownPayload } from './tables/components/types';
import type { ReactNode, KeyboardEvent, MouseEvent, Ref } from 'react';

export interface CalendarSharedProps extends Omit<MonthBaseProps, 'value'> {
  dateViewCount?: number;
  defaultView?: 'date' | 'month' | 'year';
  defaultMonth?: Date;
  enableHeaderLabel?: boolean;
  locale?: string;
  labelFormat?: { month: string; year: string };
  monthLabelFormat?: string;
  onDayMouseEnter?: (date: Date, event: MouseEvent) => void;
  onMonthChange?: (month: Date) => void;
  paginateBy?: number;
  lockView?: boolean;
  renderDay?: (date: Date) => ReactNode;
  weekdayLabelFormat?: string;
  yearLabelFormat?: string;
}

interface CalendarBaseProps extends CommonProps, CalendarSharedProps {
  ref?: Ref<HTMLDivElement>;
  onChange?: (value: Date | Date[]) => void;
  value?: Date | Date[] | null;
}

const CalendarBase = (props: CalendarBaseProps) => {
  const {
    className,
    dateViewCount = 1,
    dayClassName,
    dayStyle,
    defaultMonth,
    defaultView = 'date',
    disableDate,
    disableOutOfMonth,
    enableHeaderLabel = true,
    firstDayOfWeek = 'monday',
    hideOutOfMonthDates,
    hideWeekdays,
    isDateFirstInRange,
    isDateInRange,
    isDateLastInRange,
    labelFormat = {
      month: 'MMM',
      year: 'YYYY',
    },
    locale,
    lockView = false,
    maxDate,
    minDate,
    month,
    monthLabelFormat = 'MMM',
    onChange,
    onDayMouseEnter,
    onMonthChange,
    paginateBy = dateViewCount,
    preventFocus,
    ref,
    renderDay,
    style,
    timeZone,
    value,
    weekdayLabelFormat = 'dd',
    weekendDays,
    yearLabelFormat = 'YYYY',
    ...rest
  } = props;

  const { locale: themeLocale } = useConfig();

  const [selectionState, setSelectionState] = useState(defaultView);

  const finalLocale = locale || themeLocale;

  const daysRefs = useRef<HTMLButtonElement[][][]>(
    Array(dateViewCount)
      .fill(0)
      .map(() => []),
  );

  const [_month, setMonth] = useControllableState({
    prop: month,
    defaultProp: defaultMonth !== undefined ? defaultMonth : toZonedDate(new Date(), timeZone),
    onChange: onMonthChange,
  });

  const [yearSelection, setYearSelection] = useState(_month?.getFullYear());
  const [monthSelection, setMonthSelection] = useState(_month?.getMonth());

  const minYear = minDate instanceof Date ? minDate.getFullYear() : 100;
  const maxYear = maxDate instanceof Date ? maxDate.getFullYear() : 10000;

  const daysPerRow = 6;

  const focusOnNextFocusableDay = (
    direction: 'down' | 'up' | 'left' | 'right',
    monthIndex: number,
    payload: DayKeydownPayload,
    n = 1,
  ) => {
    const changeRow = ['down', 'up'].includes(direction);

    const rowIndex = changeRow
      ? payload.rowIndex + (direction === 'down' ? n : -n)
      : payload.rowIndex;

    const cellIndex = changeRow
      ? payload.cellIndex
      : payload.cellIndex + (direction === 'right' ? n : -n);

    const dayToFocus = daysRefs.current[monthIndex]?.[rowIndex]?.[cellIndex];

    if (!dayToFocus) {
      return;
    }

    if (dayToFocus.disabled) {
      focusOnNextFocusableDay(direction, monthIndex, payload, n + 1);
    } else {
      dayToFocus.focus();
    }
  };

  const handleDayKeyDown = (
    monthIndex: number,
    payload: DayKeydownPayload,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const monthDays = daysRefs.current[monthIndex] ?? [];
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();

        const hasRowBelow = payload.rowIndex + 1 < monthDays.length;
        if (hasRowBelow) {
          focusOnNextFocusableDay('down', monthIndex, payload);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();

        const hasRowAbove = payload.rowIndex > 0;
        if (hasRowAbove) {
          focusOnNextFocusableDay('up', monthIndex, payload);
        }
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();

        const isNotLastCell = payload.cellIndex !== daysPerRow;
        if (isNotLastCell) {
          focusOnNextFocusableDay('right', monthIndex, payload);
        } else if (monthIndex + 1 < dateViewCount) {
          daysRefs.current[monthIndex + 1]?.[payload.rowIndex]?.[0]?.focus();
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();

        if (payload.cellIndex !== 0) {
          focusOnNextFocusableDay('left', monthIndex, payload);
        } else if (monthIndex > 0) {
          daysRefs.current[monthIndex - 1]?.[payload.rowIndex]?.[daysPerRow]?.focus();
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div ref={ref} className={classNames('picker-view', className)} {...rest}>
      {selectionState === 'year' && (
        <YearTable
          value={yearSelection as number}
          minYear={minYear}
          maxYear={maxYear}
          className={className}
          preventFocus={preventFocus}
          yearLabelFormat={yearLabelFormat}
          onChange={(year) => {
            setMonth(new Date(year, monthSelection as number, 1));
            if (lockView) {
              onChange?.(new Date(year, 0, 1));
              return;
            }
            setYearSelection(year);
            setSelectionState('date');
          }}
        />
      )}
      {selectionState === 'month' && (
        <MonthTable
          value={{
            month: (_month as Date).getMonth(),
            year: (_month as Date).getFullYear(),
          }}
          year={yearSelection as number}
          locale={finalLocale}
          minDate={minDate}
          maxDate={maxDate}
          className={className}
          style={style}
          preventFocus={preventFocus}
          yearLabelFormat={yearLabelFormat}
          monthLabelFormat={monthLabelFormat}
          onYearChange={setYearSelection}
          onNextLevel={() => setSelectionState('year')}
          onChange={(monthValue) => {
            setMonth(new Date(yearSelection as number, monthValue, 1));
            if (lockView) {
              onChange?.(new Date(yearSelection as number, monthValue, 1));
              return;
            }
            setMonthSelection(monthValue);
            setSelectionState('date');
          }}
        />
      )}
      {selectionState === 'date' && (
        <DateTable
          dateViewCount={dateViewCount}
          paginateBy={paginateBy}
          month={_month}
          locale={finalLocale}
          minDate={minDate}
          maxDate={maxDate}
          enableHeaderLabel={enableHeaderLabel}
          daysRefs={daysRefs}
          style={style}
          dayClassName={dayClassName}
          dayStyle={dayStyle}
          disableOutOfMonth={disableOutOfMonth}
          disableDate={disableDate}
          hideWeekdays={hideWeekdays}
          preventFocus={preventFocus}
          firstDayOfWeek={firstDayOfWeek}
          value={value as Date | Date[]}
          labelFormat={labelFormat}
          weekdayLabelFormat={weekdayLabelFormat}
          renderDay={renderDay}
          hideOutOfMonthDates={hideOutOfMonthDates}
          isDateInRange={isDateInRange}
          isDateFirstInRange={isDateFirstInRange}
          isDateLastInRange={isDateLastInRange}
          timeZone={timeZone}
          weekendDays={weekendDays}
          onMonthChange={setMonth}
          onNextLevel={(view) => setSelectionState(view)}
          onDayKeyDown={handleDayKeyDown}
          onChange={onChange}
          onDayMouseEnter={onDayMouseEnter}
        />
      )}
    </div>
  );
};

export default CalendarBase;
