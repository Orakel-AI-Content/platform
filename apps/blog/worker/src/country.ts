/**
 * País da requisição, de `request.cf.country`. No desenvolvimento e no alvo local
 * (`ALLOW_COUNTRY_OVERRIDE`), o cabeçalho `X-Test-Country` simula outro país. Nunca há
 * geolocalização própria nem uso do IP.
 */
export function resolveCountry(
  cfCountry: unknown,
  testCountry: string | null,
  allowOverride: boolean,
): string | undefined {
  if (allowOverride && testCountry !== null && /^[A-Z]{2}$/.test(testCountry)) return testCountry;
  return typeof cfCountry === 'string' && cfCountry !== '' ? cfCountry : undefined;
}
