// Subcaminho ".": só o que não depende da versão do schema. As funções sobre os tipos do
// content-model ficam no subcaminho da versão ("@orakel/core/v1") — ADR 0002.

export type { Issue, Result } from './result.ts';
export { escapeHtml, renderHead, serializeJsonLd, type HeadTag } from './head.ts';
export {
  CRAWLERS,
  CRAWLERS_REVIEWED_AT,
  blockedUserAgents,
  type Crawler,
  type CrawlerCategory,
} from './crawlers.ts';
export { CACHE_CONTROL, IMMUTABLE_PATHS, REDIRECT_LIMITS, SECURITY_HEADERS } from './policy.ts';
