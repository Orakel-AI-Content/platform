# Visão geral do blog

Consulte antes de mudar dados, rotas, presets, o fim do build ou a visualização.

```mermaid
flowchart LR
  subgraph build[Build estático · SITE_ID]
    L[snapshotLoaders<br/>API ou fixture] --> C[coleções]
    C --> R[siteRoutes → [...path].astro]
    C --> E[/orakel-edge.json/]
    R --> H[HTML + CSS]
    E --> I[integração site-files]
    H --> I
    I --> O[_redirects · _headers · robots · rss · sitemaps<br/>manifesto · /fonts/ · pagefind/<br/>orçamento de JS · metaFile]
  end
  subgraph preview[Visualização · SSR]
    M[middleware /&lt;site&gt;/&lt;caminho&gt;] --> P[readSnapshot + cache 10 s]
    P --> R2[mesma rota e mesmas views]
  end
```

| Pacote           | O blog usa                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| `content-client` | `snapshotLoaders` (build), `readSnapshot` (SSR e fixture), `failureKind` |
| `content-model`  | Tipos v1, fixtures, `RESOURCES` (presets)                                |
| `core`           | Rotas, `seoHead`/`renderHead`, `edgeFiles`, `mediaUrl`                   |
| `tokens`         | `themeCss` no `<head>`, `themeFonts` (preload e cópia para `/fonts/`)    |
| `events`         | Script do pageview, `buildEventManifest`                                 |
| `elements`       | `ok-carousel`, `ok-menu`, `ok-copy-link`, `ok-share` (degrau 2)          |

Falhas saem como `BuildError` (`transient`/`permanent`), e o render do `build-site` traduz para 20/10.
