// Ecme v1.3.10 (e5f9a1d): src/components/ui/DatePicker/index.tsx
// Adaptado (#318): só o DateTimepicker; o composto `DatePicker` (com `DatePicker.DatePickerRange`
// e `DatePicker.DateTimepicker`) depende do DatePicker só de data e do DatePickerRange, não
// portados (nenhuma tela usa).
import DateTimepicker from './DateTimepicker';

export type { DateTimepickerProps } from './DateTimepicker';
export { DateTimepicker };
export default DateTimepicker;
