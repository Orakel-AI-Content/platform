// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/utils/getDecadeRange.ts
export function getDecadeRange(year: number) {
  const rounded = year - (year % 10) - 1;
  const range = [];
  for (let i = 0; i < 12; i += 1) {
    const rangeYear = rounded + i;
    range.push(rangeYear);
  }

  return range;
}
