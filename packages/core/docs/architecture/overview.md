# Visão geral do core

Consulte antes de mudar uma rota, o head, o JSON-LD ou um arquivo gerado da borda.

```mermaid
flowchart LR
  S[Snapshot v1<br/>content-client] --> R[routes<br/>caminhos · routeConflicts]
  S --> H[seoHead → HeadTag[]]
  H --> RH[renderHead<br/>escape]
  RH --> L[layout do blog]
  R --> L
  S --> E[edgeFiles]
  E --> F[robots.txt · _redirects · _headers · rss.xml · sitemaps]
  E --> U[redirectUsage → result.json]
  R -->|contentPath| M[events: buildEventManifest]
```

- **Rotas (ADR 0003):** fonte única dos caminhos; colisões são falha permanente.
- **Head (ADR 0004, 0007):** estrutura neutra e JSON-LD num `@graph`; `renderHead` é o único gerador de HTML.
- **Arquivos (ADR 0005, 0006, 0008–0010):** `edgeFiles` gera tudo num passo, determinístico, e devolve problemas como valor.
- **Indexável × não indexável:** `indexavel` desligado ⇒ `X-Robots-Tag` e meta `noindex`, sitemap vazio; o `robots.txt` não muda.

Neutro em `"."` (head, crawlers, políticas); o que usa os tipos do schema em `./v1` (ADR 0002).
