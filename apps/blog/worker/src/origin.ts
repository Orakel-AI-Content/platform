/**
 * O evento vem de uma página do próprio site. O Worker atende o domínio do site, então a
 * origem esperada é a da própria requisição. Com `Sec-Fetch-Site`, ele decide; sem ele
 * (navegadores antigos), vale o `Origin`.
 */
export function isSameOrigin(
  headers: { secFetchSite: string | null; origin: string | null },
  requestOrigin: string,
): boolean {
  if (headers.secFetchSite !== null) return headers.secFetchSite === 'same-origin';
  return headers.origin === requestOrigin;
}
