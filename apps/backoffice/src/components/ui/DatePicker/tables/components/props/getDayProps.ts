// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/components/props/getDayProps.ts
// Adaptado (#317): sem o cálculo de intervalo (`props/` do Ecme; nenhuma tela usa intervalo); `range`, `inRange`,
// `firstInRange`, `lastInRange` e `selectedInRange` ficam sempre falsos, e quem quiser marcar um
// intervalo usa `isDateInRange` e afins no Month, como no Ecme.
import { isSameDate } from '../../../utils';
import isWeekend from './isWeekend';
import isOutside from './isOutside';
import isDisabled from './isDisabled';

export type GetDayProps = {
  date: Date;
  month: Date;
  hasValue: boolean;
  maxDate: Date;
  minDate: Date;
  value: Date | Date[];
  disableDate: (date: Date) => boolean;
  disableOutOfMonth: boolean;
  weekendDays: number[];
};

export type GetDayPropsReturn = {
  disabled: boolean;
  weekend: boolean;
  selectedInRange: boolean;
  selected: boolean;
  inRange: boolean;
  firstInRange: boolean;
  lastInRange: boolean;
  outOfMonth: boolean;
};

export default function getDayProps(props: GetDayProps): GetDayPropsReturn {
  const {
    date,
    month,
    hasValue,
    minDate,
    maxDate,
    value,
    disableDate,
    disableOutOfMonth,
    weekendDays,
  } = props;

  const outOfMonth = isOutside(date, month);
  const selected =
    hasValue &&
    (Array.isArray(value) ? value.some((val) => isSameDate(val, date)) : isSameDate(date, value));

  return {
    disabled: isDisabled({
      minDate,
      maxDate,
      disableDate,
      disableOutOfMonth,
      date,
      outOfMonth,
    }),
    weekend: isWeekend(date, weekendDays),
    selectedInRange: false,
    selected,
    inRange: false,
    firstInRange: false,
    lastInRange: false,
    outOfMonth,
  };
}
