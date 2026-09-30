import type { DeviceClass } from '@orakel/events/v1';

/**
 * Classe de dispositivo pelo user-agent (heurística simples, para o painel). A dica
 * `Sec-CH-UA-Mobile: ?1`, quando presente, confirma celular.
 */
export function deviceClass(userAgent: string, mobileHint: string | null = null): DeviceClass {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(userAgent)) return 'tablet';
  if (mobileHint === '?1') return 'mobile';
  if (/Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) return 'mobile';
  return 'desktop';
}
