// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/YearTable.tsx
// Adaptado (#317), como o MonthTable: nomes das setas em pt-BR ("Década anterior", "Próxima
// década"), `aria-pressed` no ano ativo e `dark:hover:bg-gray-600` no hover.
import { useState } from 'react';
import classNames from '../../utils/classNames';
import Header from './Header';
import { getDecadeRange, formatYear } from '../utils';
import type { CommonProps } from '../../@types/common';

export interface YearTableProps extends CommonProps {
  value: number;
  onChange: (value: number) => void;
  minYear?: number;
  maxYear?: number;
  yearLabelFormat?: string;
  preventFocus?: boolean;
}

const YearTable = (props: YearTableProps) => {
  const {
    className,
    value,
    onChange,
    minYear,
    maxYear,
    preventFocus,
    yearLabelFormat = 'YYYY',
    ...rest
  } = props;

  const [decade, setDecade] = useState(value);
  const range = getDecadeRange(decade);
  const first = range[0] as number;
  const last = range[range.length - 1] as number;

  const years = range.map((year) => {
    const disabled = year < (minYear as number) || year > (maxYear as number);

    const active = year === value;

    return (
      <button
        key={year}
        disabled={disabled}
        aria-pressed={active}
        className={classNames(
          'year-picker-cell',
          active && !disabled
            ? 'year-picker-cell-active bg-primary'
            : 'text-gray-800 dark:text-gray-100',
          !active && !disabled && 'hover:bg-gray-100 dark:hover:bg-gray-600',
          disabled && 'year-picker-cell-disabled',
        )}
        type="button"
        onClick={() => onChange(year)}
        onMouseDown={(event) => preventFocus && event.preventDefault()}
      >
        {formatYear(year, yearLabelFormat)}
      </button>
    );
  });

  return (
    <div className={classNames('year-picker', className)} {...rest}>
      <Header
        nextLevelDisabled
        label={`${formatYear(first, yearLabelFormat)} - ${formatYear(last, yearLabelFormat)}`}
        hasPrevious={typeof minYear === 'number' ? minYear < first : true}
        hasNext={typeof maxYear === 'number' ? maxYear > last : true}
        nextLabel="Próxima década"
        previousLabel="Década anterior"
        preventFocus={preventFocus}
        onNext={() => setDecade((current) => current + 10)}
        onPrevious={() => setDecade((current) => current - 10)}
      />
      <div className="year-table">{years}</div>
    </div>
  );
};

export default YearTable;
