// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/Calendar.tsx
// Adaptado (#317):
// - prop `timeZone` (fuso IANA do site, `SiteSummary.timeZone`): o `value` é um instante, e a
//   grade o mostra no dia de parede do fuso; o dia clicado volta como o instante daquele dia no
//   fuso, com a hora de parede do valor anterior (00:00 sem valor), para o DateTimepicker não
//   perder o horário. Sem `timeZone`, como no Ecme: fuso do navegador e o dia à meia-noite;
// - `onChange` declarado como propriedade de função, pela regra `unbound-method` do lint;
// - seleção múltipla sem valor começa de lista vazia (no Ecme, `[...undefined]` lançava erro).
'use client';

import CalendarBase from './CalendarBase';
import { fromZonedDate, isSameDate, toZonedDate } from './utils';
import type { CommonProps } from '../@types/common';
import type { CalendarSharedProps } from './CalendarBase';

export interface CalenderProps<MultipleSelection extends boolean = false>
  extends CommonProps, CalendarSharedProps {
  multipleSelection?: MultipleSelection;
  value?: MultipleSelection extends true ? Date[] : Date | null;
  onChange?: (value: MultipleSelection extends true ? Date[] : Date | null) => void;
}

const Calendar = <MultipleSelection extends boolean = false>(
  props: CalenderProps<MultipleSelection>,
) => {
  const { multipleSelection, value, onChange, timeZone, ...rest } = props;

  type Value = MultipleSelection extends true ? Date[] : Date;

  const zoned = (date: Date) => toZonedDate(date, timeZone);

  const zonedValue = Array.isArray(value) ? value.map(zoned) : value ? zoned(value) : value;

  /** Dia da grade → instante no fuso, com a hora de parede de `previous`. */
  const toInstant = (day: Date, previous?: Date | null) => {
    if (!timeZone) return day;
    const time = previous ? zoned(previous) : undefined;
    const wall = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      time?.getHours() ?? 0,
      time?.getMinutes() ?? 0,
      time?.getSeconds() ?? 0,
      time?.getMilliseconds() ?? 0,
    );
    return fromZonedDate(wall, timeZone);
  };

  const handleChange = (date: Date | Date[]) => {
    const day = date as Date;

    if (!multipleSelection) {
      return onChange?.(toInstant(day, value as Date | null | undefined) as Value);
    }

    const values = (value as Date[] | undefined) ?? [];
    const isSelected = values.some((val) => isSameDate(zoned(val), day));

    return onChange?.(
      (isSelected
        ? values.filter((val) => !isSameDate(zoned(val), day))
        : [...values, toInstant(day)]) as Value,
    );
  };

  return <CalendarBase value={zonedValue} timeZone={timeZone} onChange={handleChange} {...rest} />;
};

export default Calendar;
