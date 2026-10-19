// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/tables/components/props/isWeekend.ts
export default function isWeekend(date: Date, weekendDays = [0, 6]) {
  return weekendDays.includes(date.getDay());
}
