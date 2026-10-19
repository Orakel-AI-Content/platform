// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/MonthTable.tsx
// Adaptado (#317):
// - nomes das setas em pt-BR ("Ano anterior", "Próximo ano") e dos meses com inicial maiúscula,
//   como o cabeçalho da tabela de dias (o locale pt-br do dayjs os dá em minúsculas);
// - o mês ativo expõe `aria-pressed`; a cor dele no escuro está no date-picker.css;
// - no escuro, o hover ganha `dark:hover:bg-gray-600`: o `hover:bg-gray-100` do Ecme, sozinho,
//   punha o texto claro sobre fundo claro.
import classNames from '../../utils/classNames';
import Header from './Header';
import { capitalize, isMonthInRange, getMonthsNames, formatYear } from '../utils';
import type { CommonProps } from '../../@types/common';

export interface MonthTableProps extends CommonProps {
  value: { year: number; month: number };
  onChange: (value: number) => void;
  locale: string;
  year: number;
  onYearChange: (year: number) => void;
  onNextLevel?: () => void;
  minDate?: Date;
  maxDate?: Date;
  monthLabelFormat?: string;
  yearLabelFormat?: string;
  preventFocus?: boolean;
}

const MonthTable = (props: MonthTableProps) => {
  const {
    className,
    value,
    onChange,
    locale,
    year,
    onYearChange,
    onNextLevel,
    minDate,
    maxDate,
    preventFocus,
    monthLabelFormat = 'MMM',
    yearLabelFormat = 'YYYY',
    ...rest
  } = props;

  const range = getMonthsNames(locale, monthLabelFormat).map(capitalize);
  const minYear = minDate instanceof Date ? minDate.getFullYear() : undefined;
  const maxYear = maxDate instanceof Date ? maxDate.getFullYear() : undefined;

  const months = range.map((month, index) => {
    const disabled = !isMonthInRange({
      date: new Date(year, index),
      minDate,
      maxDate,
    });

    const active = index === value.month && year === value.year;

    return (
      <button
        key={month}
        className={classNames(
          'month-picker-cell',
          active && !disabled
            ? 'month-picker-cell-active bg-primary'
            : 'text-gray-800 dark:text-gray-100',
          !active && !disabled && 'hover:bg-gray-100 dark:hover:bg-gray-600',
          disabled && 'month-picker-cell-disabled',
        )}
        disabled={disabled}
        aria-pressed={active}
        type="button"
        onClick={() => onChange(index)}
        onMouseDown={(event) => preventFocus && event.preventDefault()}
      >
        {month}
      </button>
    );
  });

  return (
    <div className={classNames('month-picker', className)} {...rest}>
      <Header
        label={formatYear(year, yearLabelFormat)}
        hasNext={typeof maxYear === 'number' ? year < maxYear : true}
        hasPrevious={typeof minYear === 'number' ? year > minYear : true}
        className={className}
        nextLabel="Próximo ano"
        previousLabel="Ano anterior"
        preventFocus={preventFocus}
        onNext={() => onYearChange(year + 1)}
        onPrevious={() => onYearChange(year - 1)}
        onNextLevel={onNextLevel}
      />
      <div className="month-table">{months}</div>
    </div>
  );
};

export default MonthTable;
