# 0002 – Escopo do scaffold: fundação + fluxo Sites → exportação

- Status: aceito
- Data: 2026-09-29

## Contexto

A entrada descreve o Backoffice inteiro da fase 0 (etapas L1, L3, L4, L5 e L6). Um scaffold
gera a fundação e um fluxo exemplar que atravessa todas as camadas; o resto é backlog.

## Decisão

Gerado:

- Next.js com layout, identidade pelo Access (JWT) e RBAC no domínio.
- Drizzle, migração inicial, `db:migrate` e `db:seed` (usuários de teste e os sites das
  fixtures do `content-model`).
- Graphile Worker com os processos `worker` (heartbeat por cron) e `build-runner` (task
  `build` registrada, ainda sem a imagem `site-builder`), e `scheduleBuild`/`buildNow`.
- Fluxo: domínio de sites e conteúdo com `recordPendingChange`, importação de snapshot,
  `GET /api/export/v1/sites/{site}/snapshot` e a tela de sites.
- Contrato: o snapshot de cada site do seed passa no `content-model` e reproduz a fixture.

Backlog (issues pelo workflow orakel): módulos Conteúdo (editor e TipTap), Mídia
(ingestão com sharp), Revisão, Publicação (limite diário, agendamento, troca de slug e
achatamento de redirects, despublicação), ações do Registro de instâncias, geração básica,
agregador, backup e restore, expurgo, promoção de release, rotas `config`, `routes` e
`listing` da API de exportação, rota interna do motor e o E2E completo.

## Alternativas consideradas

- Fluxo "aprovar → job de build": o `build-runner` não teria o que executar.
- Só a fundação: sem exemplo de como as camadas se ligam.

## Consequências

O job `test:contract` do CI passa a rodar. Blog, `content-client` e `build-site` já têm o
snapshot real para consumir.
