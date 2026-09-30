# Visão geral do build-site

Consulte antes de mudar um entrypoint, o contrato do volume ou a imagem.

```mermaid
sequenceDiagram
  participant BR as build-runner (backoffice)
  participant R as render (rede export)
  participant V as volume /build
  participant P as publish (rede publish)
  BR->>R: SITE_ID, SITE_DOMAIN, EXPORT_*, RELEASE, ACTIVE_PAGE_COUNT…
  R->>R: astro build do blog (snapshot da API) → pasta do container
  R->>V: site/, wrangler.{cloudflare,local}.jsonc, result.json
  R-->>BR: código 0 / 10 / 20
  BR->>P: DEPLOY_TARGET + token de deploy (só com 0)
  P->>P: tar.gz → wrangler deploy | edge-local; build-cache
  P->>V: publish.json (versionId)
  P-->>BR: código 0 / 10 / 20
```

- **render** (ADR 0002, 0003, 0004): a lógica do site é toda do blog; aqui ficam a orquestração, a trava e os alvos do wrangler.
- **publish** (ADR 0005): só depois de um render `ok`; nunca acessa a API.
- **ssr**: o servidor `preview` do blog, feito na construção da imagem.
- **Contrato** (`src/contract.ts`, subcaminho `./contract`): o que o backoffice lê do volume.
