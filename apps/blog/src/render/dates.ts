import type { SiteConfig } from '@orakel/content-model/v1';

/** Data por extenso no idioma e no fuso do site (o fuso só formata o que é exibido). */
export function formatDate(iso: string, config: Pick<SiteConfig, 'language' | 'timeZone'>): string {
  return new Intl.DateTimeFormat(config.language, {
    dateStyle: 'long',
    timeZone: config.timeZone,
  }).format(new Date(iso));
}
