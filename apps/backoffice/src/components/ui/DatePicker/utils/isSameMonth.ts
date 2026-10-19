// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/utils/isSameMonth.ts
export function isSameMonth(date: Date, comparison: Date) {
  return (
    date.getFullYear() === comparison.getFullYear() && date.getMonth() === comparison.getMonth()
  );
}
