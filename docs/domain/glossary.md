# Glossário

Consulte quando um termo do domínio aparecer em issue, código ou documentação. Novos
termos entram aqui no mesmo PR que os introduz.

| Termo                    | Definição                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Site**                 | Uma instância da rede, identificada por `SITE_ID`. Mesmo código, configuração própria                                                                                        |
| **Configuração do site** | Domínios, idioma, fuso, `indexavel`, tema, presets, variantes, feature flags, sobrescrita de crawlers, textos institucionais, integrações. Schema em `@orakel/content-model` |
| **`indexavel`**          | Flag do site: se buscadores podem indexá-lo (afeta `robots.txt`, meta robots e sitemap)                                                                                      |
| **Crawlers**             | Lista de robôs tratados em `robots.txt`; o site pode sobrescrever a lista padrão                                                                                             |
| **Tema**                 | Conjunto de tokens (cores, tipografia, espaçamento, raios, sombras) de um site; um JSON em `@orakel/tokens`                                                                  |
| **Preset**               | Composição pronta de página escolhida por tipo de página                                                                                                                     |
| **Variante**             | Alternativa de apresentação de um componente ou página, escolhida por configuração                                                                                           |
| **Artigo**               | Unidade de conteúdo publicada; sequência de blocos                                                                                                                           |
| **Bloco**                | Parte de um artigo com `type` e `n`. Catálogo inicial: texto, sumário, citação, imagem, FAQ                                                                                  |
| **`n`**                  | Número estável do bloco no artigo; nunca reutilizado, mesmo após remoção                                                                                                     |
| **Bloco de texto**       | Rich text restrito (subconjunto controlado de marcações)                                                                                                                     |
| **Bloco de imagem**      | Imagem com texto alternativo obrigatório ou marcada como decorativa                                                                                                          |
| **Perfil de imagem**     | Conjunto de tamanhos e formatos que uma versão do schema suporta                                                                                                             |
| **`schemaVersion`**      | Versão do contrato de conteúdo. Evolução aditiva dentro dela; incompatível cria a próxima                                                                                    |
| **Validação semântica**  | Regras além do schema (ex.: `n` único no artigo, alt obrigatório)                                                                                                            |
| **API de exportação**    | Endpoint do Backoffice que entrega o conteúdo de um site em NDJSON, em streaming                                                                                             |
| **Publish API**          | API do Backoffice que dispara publicação                                                                                                                                     |
| **Visualização**         | Renderização SSR de um conteúdo ainda não publicado, para revisão                                                                                                            |
| **Build de site**        | Execução da imagem `site-builder` (render + publish) para um `SITE_ID`                                                                                                       |
| **Evento**               | Registro anônimo de interação enviado a `/_e/*`; formato em `@orakel/events`                                                                                                 |
| **Agregador**            | Job horário do `backoffice-worker` que consolida eventos da fila e do Analytics Engine no Postgres (ADR 0009)                                                                |
| **Core**                 | Conjunto versionado por `core-vX.Y.Z` (schema, pacotes e imagem `site-builder`)                                                                                              |
| **Unidade**              | App ou pacote do monorepo, com `package.json`, `CLAUDE.md` e `docs/` próprios                                                                                                |
| **Recursos suportados**  | Tipos de bloco, presets, variantes e perfil de imagem que uma release sabe renderizar (`RESOURCES` do `content-model`); a validação usa os da release do site                |
| **Linha do snapshot**    | Uma linha do NDJSON da API de exportação: `header`, `{ type, data }` por entidade, `end` com as contagens                                                                    |
| **Fixture**              | Snapshot NDJSON de um site de exemplo, em `@orakel/content-model/fixtures/v<n>/`, validado pelo teste do pacote                                                              |
| **Manifesto de eventos** | Arquivo gerado no build com os artigos publicados (ID e caminho), lido pelo Worker para validar eventos (`@orakel/events`)                                                   |
| **Evento descartado**    | Requisição a `/_e/*` recusada (bot, origem, tamanho, schema, manifesto); vira um ponto `discard` no Analytics Engine, com o motivo                                           |
