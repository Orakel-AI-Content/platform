# Visão geral do content-model

Consulte antes de mudar um schema, acrescentar um recurso (bloco, preset, variante) ou
criar uma versão nova. Visão do sistema e demais contratos: `docs/architecture/overview.md`
da raiz.

## Papel

Contrato único de conteúdo e configuração de site. O mesmo schema valida os dois lados:

```mermaid
flowchart LR
  BO[backoffice<br/>valida na aprovação<br/>produz o snapshot] -->|NDJSON /api/export/v1| CC[content-client<br/>valida cada linha]
  CC --> BLOG[blog e build-site<br/>renderizam]
  CM[(@orakel/content-model/v1)] -.-> BO
  CM -.-> CC
  CM -.-> BLOG
```

| Consumidor       | Usa                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `backoffice`     | Schemas das entidades, `validateContent`, `validateSiteConfig`, fixtures no teste de contrato |
| `content-client` | `parseSnapshotLine` linha a linha, `validateSnapshot`                                         |
| `blog`           | Tipos das entidades e dos blocos para renderizar; fixtures nos sites de exemplo               |
| `build-site`     | Tipos da configuração do site                                                                 |

## O que a v1 contém

- **Configuração do site** (`SiteConfigSchema`): domínios (o primeiro é o principal),
  idioma, fuso, `indexavel`, tema, preset por tipo de página, variante por componente,
  feature flags, sobrescrita de crawlers, textos institucionais, integrações (GA4).
- **Entidades:** `author`, `taxonomy` (`category`, `tag`, `series`), `menu`, `media`
  (com as variantes do perfil de imagem), `redirect` (301, 302, 303, 307, 308),
  `content` (`article` ou `page`, com ID numérico estável e blocos).
- **Blocos:** `text` (rich text restrito), `toc`, `quote`, `image` (alt ou decorativa),
  `faq`; todo bloco tem `type` e `n`.
- **Snapshot:** `SnapshotLineSchema` — `header`, `{ type, data }` por entidade, `end`.
- **Recursos** (`RESOURCES`): tipos de bloco, presets por tipo de página, variantes por
  componente e perfil de imagem que o código atual sabe renderizar.
- **Validação semântica:** estrutura do snapshot, referências, unicidade de slugs e de
  `n`, recursos suportados.

## Regras do contrato

- **Parse tolerante:** chave desconhecida é descartada, nunca é erro. Uma release antiga
  lê um snapshot com campos novos.
- **Evolução aditiva** dentro da versão; incompatível cria `src/v<n+1>/` (ADR 0002).
- **Recursos por release:** a validação semântica recebe o `Resources` da release do
  site. O backoffice guarda os recursos de cada release e valida contra eles, para que
  um recurso novo não chegue a um site cuja release não sabe renderizá-lo.
- **`n` estável:** atribuído pelo backoffice e nunca reutilizado; o identificador de
  reconciliação de afiliados depende dele.

## Requisitos não funcionais

- Cobertura de 90% de linhas e branches (a v1 começou com 100%).
- Sem dependência de runtime além do Zod; funciona em Node, no navegador e em Workers.

## A definir

Ver `open_questions` em `docs/project-spec.yaml`: formato final do rich text, forma
exata dos campos de configuração, presets e variantes além do mínimo.
