// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/utils/formatYear.tsx
// Adaptado (#317): `.ts`, sem JSX.
import dayjs from 'dayjs';

export function formatYear(year: number, format?: string) {
  return dayjs(new Date(year, 1, 1)).format(format);
}
