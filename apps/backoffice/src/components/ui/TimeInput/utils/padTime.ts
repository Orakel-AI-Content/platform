// Ecme v1.3.10 (e5f9a1d): src/components/ui/TimeInput/utils/padTime.ts
export function padTime(value: string) {
  const _val = parseInt(value, 10);
  return _val >= 10 ? _val.toString() : `0${_val}`;
}
