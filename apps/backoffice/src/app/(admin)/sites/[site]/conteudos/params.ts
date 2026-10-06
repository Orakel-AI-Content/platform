/** ID ou número de versão vindo da URL: inteiro positivo, ou `undefined` (vira 404). */
export function positiveInt(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
