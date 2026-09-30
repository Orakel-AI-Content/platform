# Design de código do core

| Arquivo                                                                  | Papel                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/head.ts`                                                            | `HeadTag`, `renderHead`, escapes de HTML e JSON-LD                        |
| `src/crawlers.ts`                                                        | `CRAWLERS`, `blockedUserAgents`                                           |
| `src/policy.ts`                                                          | `REDIRECT_LIMITS`, `CACHE_CONTROL`, `IMMUTABLE_PATHS`, `SECURITY_HEADERS` |
| `src/xml.ts`, `src/result.ts`                                            | Escape de XML; `Issue`/`Result` do content-model                          |
| `src/v1/site.ts`                                                         | URL absoluta, mídia, imagem de compartilhamento, índices por ID           |
| `src/v1/routes.ts`                                                       | Caminhos, institucionais, `RESERVED_SLUGS`, `routeConflicts`              |
| `src/v1/seo.ts`, `json-ld.ts`                                            | `seoHead` por tipo de página; nós do schema.org                           |
| `src/v1/sitemap.ts`, `rss.ts`, `robots.ts`, `redirects.ts`, `headers.ts` | Um arquivo gerado cada                                                    |
| `src/v1/files.ts`                                                        | `edgeFiles`: todos os arquivos e os problemas                             |

- Funções puras: sem disco, rede, relógio nem env. Datas vêm do snapshot.
- Saída determinística: ordem estável (caminho, ID, data) em tudo que vira arquivo.
- Problema esperado é `Issue`; só erro de programação (página inválida, config sem domínio) lança.
- Todo texto que vai para HTML ou XML passa por `escapeHtml`, `serializeJsonLd` ou `escapeXml`.

Anti-padrões: montar caminho com template string fora de `routes.ts`; hora atual em arquivo gerado; regra de cache em `/*` no `_headers`.
