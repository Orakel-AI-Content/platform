// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/components/Month.tsx
// Adaptado (#317):
// - prop `timeZone`: "hoje" é a data de parede de agora no fuso do site (`toZonedDate`), não a do
//   navegador; o `value` já chega na hora de parede do fuso, convertido pelo Calendar;
// - sem `range` (o `getRangeProps` não foi portado);
// - o dia que recebe o Tab quando não há valor no mês é recalculado a cada mês exibido: no Ecme um
//   `useMemo` sem dependências guardava o do primeiro mês, e ao paginar nenhum dia ficava
//   focável; e "valor no mês" é `isSameMonth`, não `isAfter(startOf('month'))`, que deixava de
//   fora o valor à meia-noite do dia 1;
// - o locale vai também ao Day, que o usa no nome por extenso.
import dayjs from 'dayjs';
import classNames from '../../../utils/classNames';
import Day from './Day';
import getDayProps from './props/getDayProps';
import { isSameDate, isSameMonth, getWeekdaysNames, getMonthDays, toZonedDate } from '../../utils';
import { useConfig } from '../../../ConfigProvider';
import type { CommonProps } from '../../../@types/common';
import type { FirstDayOfWeek } from '../../../@types/date';
import type { Modifiers, DayKeydownPayload } from './types';
import type { GetDayPropsReturn } from './props/getDayProps';
import type { KeyboardEvent, ReactNode, MouseEvent, CSSProperties, Ref } from 'react';

export interface MonthBaseProps {
  month?: Date;
  value?: Date | Date[];
  dayClassName?: (date: Date, modifiers: Modifiers) => string;
  dayStyle?: (date: Date, modifiers: Modifiers) => CSSProperties;
  disableDate?: (date: Date) => boolean;
  disableOutOfMonth?: boolean;
  minDate?: Date;
  maxDate?: Date;
  hideWeekdays?: boolean;
  fullWidth?: boolean;
  preventFocus?: boolean;
  focusable?: boolean;
  firstDayOfWeek?: FirstDayOfWeek;
  hideOutOfMonthDates?: boolean;
  /** Fuso IANA do site ("America/Sao_Paulo"); sem ele, o do navegador, como no Ecme. */
  timeZone?: string;
  weekendDays?: [number, number];
  isDateInRange?: (() => boolean) | ((date: Date, props: GetDayPropsReturn) => boolean);
  isDateFirstInRange?: (() => boolean) | ((date: Date, props: GetDayPropsReturn) => boolean);
  isDateLastInRange?: (() => boolean) | ((date: Date, props: GetDayPropsReturn) => boolean);
}

export interface MonthProps extends CommonProps, MonthBaseProps {
  onChange?: (value: Date) => void;
  locale?: string;
  onDayMouseEnter?: (date: Date, event: MouseEvent<HTMLButtonElement>) => void;
  onDayKeyDown?: (payload: DayKeydownPayload, event: KeyboardEvent<HTMLButtonElement>) => void;
  daysRefs: HTMLButtonElement[][];
  ref?: Ref<HTMLTableElement>;
  renderDay?: (date: Date) => ReactNode;
  weekdayLabelFormat?: string;
}

const noop = () => false;

const Month = (props: MonthProps) => {
  const {
    className,
    month,
    value,
    onChange,
    disableOutOfMonth = false,
    locale,
    dayClassName,
    dayStyle,
    minDate,
    maxDate,
    disableDate,
    onDayMouseEnter,
    hideWeekdays = false,
    fullWidth = false,
    preventFocus = false,
    focusable = true,
    firstDayOfWeek = 'monday',
    onDayKeyDown,
    daysRefs,
    hideOutOfMonthDates = false,
    isDateInRange = noop,
    isDateFirstInRange = noop,
    isDateLastInRange = noop,
    ref,
    renderDay,
    timeZone,
    weekdayLabelFormat,
    weekendDays = [0, 6],
    ...rest
  } = props;

  const { locale: themeLocale } = useConfig();

  const finalLocale = locale || themeLocale;
  const days = getMonthDays(month as Date, firstDayOfWeek);
  const today = toZonedDate(new Date(), timeZone);

  const weekdays = getWeekdaysNames(finalLocale, firstDayOfWeek, weekdayLabelFormat).map(
    (weekday) => (
      <th key={weekday} className="week-day-cell">
        <span className="week-day-cell-content">{weekday}</span>
      </th>
    ),
  );

  const hasValue = Array.isArray(value)
    ? value.every((item) => item instanceof Date)
    : value instanceof Date;

  const hasValueInMonthRange = value instanceof Date && isSameMonth(value, month as Date);

  const getDayPropsParams = {
    month: month as Date,
    hasValue,
    minDate: minDate as Date,
    maxDate: maxDate as Date,
    value: value as Date | Date[],
    disableDate: disableDate as (date: Date) => boolean,
    disableOutOfMonth: disableOutOfMonth,
    weekendDays,
  };

  const firstIncludedDay =
    days.flat().find((date) => {
      const dayProps = getDayProps({ ...getDayPropsParams, date });
      return !dayProps.disabled && !dayProps.outOfMonth;
    }) || dayjs(month).startOf('month').toDate();

  const rows = days.map((row, rowIndex) => {
    const cells = row.map((date, cellIndex) => {
      const dayProps = getDayProps({ ...getDayPropsParams, date });

      const onKeyDownPayload = { rowIndex, cellIndex, date };

      return (
        <td key={cellIndex} className={classNames('date-picker-cell')}>
          <Day
            ref={(button) => {
              if (daysRefs) {
                if (!Array.isArray(daysRefs[rowIndex])) {
                  daysRefs[rowIndex] = [];
                }

                daysRefs[rowIndex][cellIndex] = button as HTMLButtonElement;
              }
            }}
            locale={finalLocale}
            outOfMonth={dayProps.outOfMonth}
            weekend={dayProps.weekend}
            inRange={dayProps.inRange || isDateInRange(date, dayProps)}
            firstInRange={dayProps.firstInRange || isDateFirstInRange(date, dayProps)}
            lastInRange={dayProps.lastInRange || isDateLastInRange(date, dayProps)}
            firstInMonth={isSameDate(date, firstIncludedDay)}
            selected={dayProps.selected || dayProps.selectedInRange}
            hasValue={hasValueInMonthRange}
            className={typeof dayClassName === 'function' ? dayClassName(date, dayProps) : ''}
            style={typeof dayStyle === 'function' ? dayStyle(date, dayProps) : {}}
            disabled={dayProps.disabled}
            fullWidth={fullWidth}
            focusable={focusable}
            hideOutOfMonthDates={hideOutOfMonthDates}
            renderDay={renderDay}
            isToday={isSameDate(date, today)}
            value={date}
            onClick={() => typeof onChange === 'function' && onChange(date)}
            onMouseDown={(event) => preventFocus && event.preventDefault()}
            onKeyDown={(event) =>
              typeof onDayKeyDown === 'function' && onDayKeyDown(onKeyDownPayload, event)
            }
            onMouseEnter={typeof onDayMouseEnter === 'function' ? onDayMouseEnter : noop}
          />
        </td>
      );
    });

    return (
      <tr key={rowIndex} className={classNames('date-picker-week-cell')}>
        {cells}
      </tr>
    );
  });

  return (
    <table ref={ref} className={classNames('picker-table', className)} cellSpacing="0" {...rest}>
      {!hideWeekdays && (
        <thead>
          <tr>{weekdays}</tr>
        </thead>
      )}
      <tbody>{rows}</tbody>
    </table>
  );
};

export default Month;
