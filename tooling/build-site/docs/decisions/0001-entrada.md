# 0001 – Entrada do scaffold do build-site

- Status: aceito
- Data: 2026-09-30

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir do bloco de scaffold da imagem `site-builder` (`12.0`, `Orakel-AI-Content/workspace`), colado no comando, com a etapa L3 como complemento. Pausado até o `apps/blog` existir e retomado com ele pronto.

## Decisão

Tópicos definidos pela entrada: imagem `site-builder:core-vX.Y.Z` com `apps/blog`, pacotes, Pagefind e `wrangler`; entrypoints `render` (rede `export`, sem token de deploy, limites de CPU e memória, `result.json` e `wrangler.jsonc` dos dois alvos, trava de segurança), `publish` (rede `publish`, único com o token de deploy, `cloudflare` ou `local`, `build-cache`, ID da versão) e `ssr` (`blog-preview`); códigos de saída 0/10/20; `wrangler.jsonc` por convenção de nomes, sem OpenTofu; testes do alvo `cloudflare`; medições com 100, 1.000 e 5.000 artigos; construção local com `pnpm local:images` e release pelo `release.yml`.

## Recortes

- `edge-local` e a task `build` real do backoffice ficam para scaffolds seguintes (ADR 0005 e spec).
- A promoção de release (build seco, canário, Lighthouse) é do módulo Releases do backoffice.
