# 0005 – robots.txt pela lista de crawlers versionada no core

- Status: aceito
- Data: 2026-09-30

## Decisão

- `CRAWLERS` (em `"."`): user-agent, categoria (`search`, `ai-search`, `ai-training`) e operador; `CRAWLERS_REVIEWED_AT` registra a última revisão.
- `robots.txt`: `User-agent: *` / `Allow: /`; um bloco com os `ai-training` e `Disallow: /`; `Sitemap:` com o índice no domínio principal. `crawlers.allow` do site tira nomes do bloqueio; `crawlers.block` acrescenta.
- Com `indexavel` desligado o arquivo é o mesmo: bloquear o rastreio impediria o buscador de ver o `noindex`.

## Alternativas consideradas

Lista como configuração da plataforma no backoffice, exportada no snapshot: muda sem release, mas exige entidade nova no contrato.

## Consequências

A revisão trimestral (G4) é um PR com teste, que chega aos sites pela promoção de release; urgência num site usa a sobrescrita.
