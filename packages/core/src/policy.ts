// Políticas da borda que não dependem do schema: limites de redirect (`05`, seção 3.2),
// cache (`05`, seção 3.4) e cabeçalhos de segurança (ADR 0006).

/** Limites do `_redirects` do Workers Static Assets; o backoffice alerta em 75%. */
export const REDIRECT_LIMITS = { static: 2000, dynamic: 100, alertRatio: 0.75 } as const;

export const CACHE_CONTROL = {
  immutable: 'public, max-age=31536000, immutable',
  revalidate: 'public, max-age=0, must-revalidate',
} as const;

/**
 * Caminhos com hash no nome, servidos como `immutable`. Todo o resto (HTML, sitemap, RSS,
 * entrada e WASM do Pagefind) fica com o padrão do Workers Static Assets, que já é
 * `CACHE_CONTROL.revalidate` — por isso não há regra `/*` de cache: no `_headers`, regras
 * que casam o mesmo caminho somam os valores do mesmo cabeçalho.
 */
export const IMMUTABLE_PATHS: readonly string[] = [
  '/_astro/*',
  // Fontes dos temas, com hash no nome (@orakel/tokens).
  '/fonts/*',
  // Pagefind: índices, fragmentos e filtros têm hash; pagefind.js e a entrada, não.
  '/pagefind/index/*',
  '/pagefind/fragment/*',
  '/pagefind/filter/*',
];

/** Conjunto mínimo em todas as respostas. HSTS fica na zona; CSP é pendência da fase 2. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};
