// Consent Mode v2 com estado padrão por região, antes de qualquer tag (P4; `07`, seção 4):
// negado no EEE, Reino Unido e Suíça; concedido nas demais regiões. Conta no orçamento de
// JS. A P4 põe o snippet no core; fica aqui até a medição ser ligada (fase 2).

/** EEE (UE + Islândia, Liechtenstein, Noruega), Reino Unido e Suíça. */
export const CONSENT_DENIED_REGIONS = [
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
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
] as const;

const SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'];

const state = (value: 'granted' | 'denied') =>
  Object.fromEntries(SIGNALS.map((signal) => [signal, value]));

export function consentSnippet(): string {
  return (
    'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}' +
    `gtag('consent','default',${JSON.stringify({ ...state('denied'), region: CONSENT_DENIED_REGIONS })});` +
    `gtag('consent','default',${JSON.stringify(state('granted'))});`
  );
}

/** GA4 diferido: carrega depois do `load`, só com a integração ligada (flag desligada na fase 0). */
export function ga4Snippet(measurementId: string): string {
  const id = JSON.stringify(measurementId);
  return (
    `addEventListener('load',function(){var s=document.createElement('script');s.async=true;` +
    `s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(${id});document.head.appendChild(s);` +
    `gtag('js',new Date());gtag('config',${id})});`
  );
}
