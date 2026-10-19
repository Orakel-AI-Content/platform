// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/components/props/isOutside.ts
import { isSameMonth } from '../../../utils';

export default function isOutside(date: Date, month: Date) {
  return !isSameMonth(date, month);
}
