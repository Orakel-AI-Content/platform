// Superfície pública de "@orakel/core/v1": funções sobre os tipos do content-model v1.
// Quem consome importa a versão explicitamente (ADR 0002).

export * from './routes.ts';
export { absoluteUrl, mediaUrl, shareImage, siteOrigin, type ShareImage } from './site.ts';
export { seoHead, type SeoPage } from './seo.ts';
export * from './json-ld.ts';
export * from './sitemap.ts';
export * from './rss.ts';
export * from './robots.ts';
export * from './redirects.ts';
export * from './headers.ts';
export * from './files.ts';
