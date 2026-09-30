// Lista de crawlers da plataforma (P10; ADR 0005). Revisada a cada trimestre (G4): mudar a
// lista é um PR com teste, que chega aos sites pela promoção de release. Cada site ajusta
// com `crawlers.allow` e `crawlers.block` da configuração.

export type CrawlerCategory = 'search' | 'ai-search' | 'ai-training';

export type Crawler = {
  userAgent: string;
  category: CrawlerCategory;
  operator: string;
};

/** Data da última revisão da lista. */
export const CRAWLERS_REVIEWED_AT = '2026-09-30';

export const CRAWLERS: readonly Crawler[] = [
  // Buscadores: sempre liberados (o Googlebot também alimenta os AI Overviews).
  { userAgent: 'Googlebot', category: 'search', operator: 'Google' },
  { userAgent: 'Bingbot', category: 'search', operator: 'Microsoft' },
  // Busca e resposta por IA: liberadas.
  { userAgent: 'OAI-SearchBot', category: 'ai-search', operator: 'OpenAI' },
  { userAgent: 'ChatGPT-User', category: 'ai-search', operator: 'OpenAI' },
  { userAgent: 'Claude-SearchBot', category: 'ai-search', operator: 'Anthropic' },
  { userAgent: 'Claude-User', category: 'ai-search', operator: 'Anthropic' },
  { userAgent: 'PerplexityBot', category: 'ai-search', operator: 'Perplexity' },
  { userAgent: 'Perplexity-User', category: 'ai-search', operator: 'Perplexity' },
  // Treinamento de IA: bloqueado.
  { userAgent: 'GPTBot', category: 'ai-training', operator: 'OpenAI' },
  { userAgent: 'ClaudeBot', category: 'ai-training', operator: 'Anthropic' },
  { userAgent: 'CCBot', category: 'ai-training', operator: 'Common Crawl' },
  { userAgent: 'Bytespider', category: 'ai-training', operator: 'ByteDance' },
  { userAgent: 'meta-externalagent', category: 'ai-training', operator: 'Meta' },
  { userAgent: 'Google-Extended', category: 'ai-training', operator: 'Google' },
  { userAgent: 'Applebot-Extended', category: 'ai-training', operator: 'Apple' },
];

/** Bloqueados no robots.txt de um site: treinamento de IA, menos `allow`, mais `block`. */
export function blockedUserAgents(override: { allow?: string[]; block?: string[] } = {}): string[] {
  const key = (agent: string) => agent.toLowerCase();
  const allowed = new Set((override.allow ?? []).map(key));
  const blocked = new Map<string, string>();
  for (const crawler of CRAWLERS) {
    if (crawler.category === 'ai-training' && !allowed.has(key(crawler.userAgent))) {
      blocked.set(key(crawler.userAgent), crawler.userAgent);
    }
  }
  for (const agent of override.block ?? []) blocked.set(key(agent), agent);
  return [...blocked.values()];
}
