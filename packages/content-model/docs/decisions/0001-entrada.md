# 0001 – Entrada do scaffold do content-model

- Status: aceito
- Data: 2026-09-29

## Contexto

A unidade foi gerada pela skill `/scaffold` (modo `unit`) a partir de duas fontes do
repositório de planejamento `Orakel-AI-Content/workspace`, arquivo
`docs/platform-requirements/12.0-fase-0-ambiente-local.md` (hash no `project-spec.yaml`):

1. a linha `packages/content-model` do bloco de scaffold do monorepo (seção 11.1);
2. a etapa L1 (seção 6), incluída como entrada complementar, com as entidades do
   snapshot, o perfil de imagem v1 e os detalhes dos blocos e da validação semântica.

## Decisão

Texto da linha do bloco, sem edição:

> Schemas Zod do conteúdo e da configuração de site, compartilhados entre o Backoffice
> (quem envia) e o build (quem consome). `schemaVersion = 1` e a lista de recursos
> suportados pela versão (tipos de bloco, presets, variantes, perfil de imagem).
> Configuração do site: domínios, idioma, fuso, flag `indexavel`, tema, presets por tipo
> de página, variantes, feature flags, sobrescrita da lista de crawlers, textos
> institucionais, integrações. Catálogo inicial de blocos: texto (rich text restrito),
> sumário, citação, imagem (texto alternativo obrigatório ou marcada como decorativa),
> FAQ; todo bloco tem `type` e `n` (número estável no artigo, nunca reutilizado).
> Validação semântica além do schema. Evolução só aditiva dentro de uma versão; mudança
> incompatível cria a versão seguinte; o parse ignora campos desconhecidos

Trechos usados da etapa L1:

> - `schemaVersion = 1` e a lista de **recursos suportados** pela versão: tipos de bloco,
>   presets, variantes, perfil de imagem.
> - **Configuração do site:** domínios, idioma, fuso, `indexavel`, tema, presets por tipo
>   de página, variantes, feature flags, sobrescrita da lista de crawlers, textos
>   institucionais (P3, P13), integrações (GA4 desligado nesta fase).
> - **Catálogo inicial de blocos:** texto (rich text restrito, com marcas e links),
>   sumário (gerado dos intertítulos), citação, imagem (referência à mídia, legenda,
>   texto alternativo obrigatório ou marcação de decorativa), FAQ (pares
>   pergunta/resposta). Todo bloco tem `n` (número estável) e `type`.
> - **Perfil de imagem v1** (_proposta_): larguras 320, 640, 960, 1280 e 1920; formatos
>   AVIF e WebP.
> - Validação semântica além do schema: referências a mídia e autores existentes, slugs
>   únicos por site, presets e variantes suportados pela release do site.
>
> `GET /api/export/v1/sites/{site}/snapshot` — NDJSON em `REPEATABLE READ`. Linha 1:
> `{"type":"header","schemaVersion":1,"site":…,"pendingChangeIds":[…]}`. Depois, uma
> linha por entidade: `config`, `author`, `taxonomy`, `menu`, `media`, `redirect`,
> `content` (só publicados). Última linha: `{"type":"end","counts":{…}}`, que o render
> usa para detectar corte.

## Alternativas consideradas

Seguir só com a linha do bloco: entidades e recursos virariam perguntas sem base.

## Consequências

Itens `source: input` do `project-spec.yaml` apontam para "11.1" ou "L1". Se o documento
de origem mudar, compare o hash e revise as decisões afetadas.
