# 0011 – Visualização local pelo Caddy; container com o build-site

- Status: aceito
- Data: 2026-09-30

- O container `blog-preview` roda a imagem `site-builder` (entrypoint `ssr`), que é do `build-site`: o blog não tem Dockerfile próprio.
- O Caddy local atende `preview.orakel.localhost` com `forward_auth` no access-mock (como o `admin`) e encaminha para `{$BLOG_PREVIEW_UPSTREAM}`, padrão `host.docker.internal:4321` (`pnpm --filter @orakel/blog preview` na máquina). Com o `build-site`, o padrão passa a `blog-preview:4321`.
- No CI, a paridade e o axe usam o build SSR em Node, sem container.
