// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/DateTable.tsx
// Adaptado (#317): sem `range`; nomes das setas em pt-BR ("Mês anterior", "Próximo mês"), que o
// Ecme não passava; no escuro, o hover do mês e do ano no cabeçalho é `primary-mild`, pelo
// contraste sobre o cartão; o `timeZone` segue ao Month no `rest`.
import dayjs from 'dayjs';
import classNames from '../../utils/classNames';
import { capitalize, isMonthInRange } from '../utils';
import Header from './Header';
import Month from './components/Month';
import type { CommonProps } from '../../@types/common';
import type { MonthBaseProps } from './components/Month';
import type { DayKeydownPayload } from './components/types';
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';

export interface DateTableProps extends CommonProps, MonthBaseProps {
  dateViewCount: number;
  paginateBy: number;
  locale: string;
  enableHeaderLabel: boolean;
  daysRefs: RefObject<HTMLButtonElement[][][] | null>;
  onMonthChange: (month: Date) => void;
  onNextLevel: (unit: 'month' | 'year') => void;
  onDayKeyDown: (
    monthIndex: number,
    payload: DayKeydownPayload,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => void;
  labelFormat?: { month: string; year: string };
  weekdayLabelFormat?: string;
  onChange?: (value: Date) => void;
  onDayMouseEnter?: (date: Date, event: MouseEvent) => void;
  preventFocus?: boolean;
  renderDay?: (date: Date) => ReactNode;
}

function formatMonthLabel({
  month,
  locale,
  format,
}: {
  month: Date;
  locale: string;
  format: string;
}) {
  return capitalize(dayjs(month).locale(locale).format(format));
}

const DateTable = (props: DateTableProps) => {
  const {
    dateViewCount,
    paginateBy,
    month,
    locale,
    minDate,
    maxDate,
    enableHeaderLabel,
    daysRefs,
    onMonthChange,
    onNextLevel,
    onDayKeyDown,
    className,
    labelFormat,
    weekdayLabelFormat,
    preventFocus,
    renderDay,
    ...rest
  } = props;

  const nextMonth = dayjs(month).add(dateViewCount, 'months').toDate();
  const previousMonth = dayjs(month).subtract(1, 'months').toDate();

  const pickerHeaderLabelClass =
    'picker-header-label hover:text-primary dark:hover:text-primary-mild';

  const months = Array(dateViewCount)
    .fill(0)
    .map((_, index) => {
      const monthDate = dayjs(month).add(index, 'months').toDate();
      return (
        <div key={index} className="day-picker">
          <Header
            hasNext={
              index + 1 === dateViewCount &&
              isMonthInRange({
                date: nextMonth,
                minDate,
                maxDate,
              })
            }
            hasPrevious={
              index === 0 &&
              isMonthInRange({
                date: previousMonth,
                minDate,
                maxDate,
              })
            }
            className={className}
            nextLabel="Próximo mês"
            previousLabel="Mês anterior"
            onNext={() => onMonthChange(dayjs(month).add(paginateBy, 'months').toDate())}
            onPrevious={() => onMonthChange(dayjs(month).subtract(paginateBy, 'months').toDate())}
          >
            <div>
              <button
                className={classNames(pickerHeaderLabelClass)}
                disabled={!enableHeaderLabel}
                tabIndex={index > 0 ? -1 : 0}
                type="button"
                onClick={() => onNextLevel('month')}
                onMouseDown={(event) => preventFocus && event.preventDefault()}
              >
                {formatMonthLabel({
                  month: monthDate,
                  locale,
                  format: labelFormat?.month || 'MMM',
                })}
              </button>
              <button
                className={classNames(pickerHeaderLabelClass)}
                disabled={!enableHeaderLabel}
                tabIndex={index > 0 ? -1 : 0}
                type="button"
                onClick={() => onNextLevel('year')}
                onMouseDown={(event) => preventFocus && event.preventDefault()}
              >
                {formatMonthLabel({
                  month: monthDate,
                  locale,
                  format: labelFormat?.year || 'YYYY',
                })}
              </button>
            </div>
          </Header>
          <Month
            month={monthDate}
            daysRefs={(daysRefs.current as HTMLButtonElement[][][])[index] as HTMLButtonElement[][]}
            minDate={minDate}
            maxDate={maxDate}
            className={className}
            locale={locale}
            focusable={index === 0}
            preventFocus={preventFocus}
            renderDay={renderDay}
            weekdayLabelFormat={weekdayLabelFormat}
            onDayKeyDown={(...args) => onDayKeyDown(index, ...args)}
            {...rest}
          />
        </div>
      );
    });

  return <>{months}</>;
};

export default DateTable;
