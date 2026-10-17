// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/clamp.ts
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
