// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/utils/isSameDate.ts
import { isSameMonth } from './isSameMonth';

export function isSameDate(date: Date, comparison: Date) {
  return isSameMonth(date, comparison) && date.getDate() === comparison.getDate();
}
