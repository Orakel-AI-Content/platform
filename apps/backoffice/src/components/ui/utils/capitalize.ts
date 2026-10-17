// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/capitalize.ts
export default function capitalize(value: string) {
  return typeof value !== 'string' ? '' : value.charAt(0).toUpperCase() + value.slice(1);
}
