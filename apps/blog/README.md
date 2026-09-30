# @orakel/blog

App Astro que gera cada site da rede por `SITE_ID` (estático) e atende a visualização de
todos os sites (SSR, `/<site>/<caminho>`). Conteúdo e configuração vêm da API de exportação
do backoffice ou das fixtures do content-model.

```sh
# .env.local na raiz: CONTENT_SOURCE=fixture e SITE_ID=exemplo-a
pnpm dev                                   # site em http://localhost:4321
SITE_ID=exemplo-b CONTENT_SOURCE=fixture pnpm build
pnpm preview                               # visualização em http://localhost:4321/exemplo-a/
pnpm build:examples && pnpm test:a11y && pnpm test:parity
```

Com o compose local (`pnpm local:up`), a visualização fica em
`https://preview.orakel.localhost/<site>/` (container `blog-preview`, a imagem `site-builder`
em modo `ssr`), e `pnpm local:publish <site>` (na raiz) gera e publica o site estático em
`https://<site>.localhost`. O `worker/` é outra unidade (Worker de borda `/_e/*`).
Documentação: `docs/README.md`.
