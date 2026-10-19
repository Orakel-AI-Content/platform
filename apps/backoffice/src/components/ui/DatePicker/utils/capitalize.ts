// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/capitalize.ts
// Adaptado (#317): fica junto do DatePicker, o único que o usa (saiu de `ui/utils` no #343).
export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
