// Regras da sessão (ID aleatório por aba, emitido pelo Worker). Sem Zod: o script do
// navegador importa SESSION_IDLE_MS daqui.

/** Sem atividade por este tempo, o script descarta o `sid` e o Worker emite outro. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * EEE (UE + Islândia, Liechtenstein, Noruega), Reino Unido e Suíça, em ISO 3166-1 alfa-2,
 * como o `request.cf.country` da Cloudflare. Nesta fase, nenhum ID de sessão para eles.
 */
export const NO_SESSION_COUNTRIES: ReadonlySet<string> = new Set([
  // União Europeia
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // Demais do EEE
  'IS',
  'LI',
  'NO',
  // Reino Unido e Suíça
  'GB',
  'CH',
]);

/**
 * O Worker pode emitir um ID de sessão para este país? País desconhecido (ausente, `XX`
 * ou `T1` do Tor) conta como "não": na dúvida, sem sessão.
 */
export function canIssueSession(country: string | undefined): boolean {
  if (country === undefined || !/^[A-Z]{2}$/.test(country)) return false;
  if (country === 'XX' || country === 'T1') return false;
  return !NO_SESSION_COUNTRIES.has(country);
}
