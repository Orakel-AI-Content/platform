# 0006 – _headers: cache só nos caminhos com hash, segurança mínima

- Status: aceito
- Data: 2026-09-30

## Decisão

- `immutable` em `/_astro/*`, `/fonts/*` (fontes com hash do `@orakel/tokens`), `/pagefind/index/*`, `/pagefind/fragment/*` e `/pagefind/filter/*`.
- Sem regra de cache em `/*`: o padrão do Workers Static Assets já é `public, max-age=0, must-revalidate`, e no `_headers` regras que casam o mesmo caminho somam os valores do mesmo cabeçalho.
- `/*`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` restritiva; `X-Robots-Tag: noindex` com `indexavel` desligado.
- Fora: HSTS (zona, OpenTofu, fase 1) e CSP (fase 2, começando em report-only, com hashes dos scripts inline).

## A validar no piloto

Que o `.pf_meta` do Pagefind (com hash, mas na raiz de `/pagefind/`) pode ficar sem `immutable` sem custo relevante, e que as regras acima casam os caminhos gerados.
