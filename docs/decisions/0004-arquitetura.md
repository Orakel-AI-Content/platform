# 0004 – Arquitetura em três planos e o agregador

- Status: aceito (o agregador foi substituído pelo 0009: é job do `backoffice-worker`)
- Data: 2026-09-29

## Contexto

A entrada descreve os sites estáticos, o Backoffice e o Worker de borda, e cita um
"agregador" e "imagens do Backoffice e serviços" sem dizer onde ficam.

## Decisão

- **Plano de conteúdo:** Backoffice Next.js (monolito modular) com UI, Publish API e API
  de exportação, sobre Postgres e armazenamento S3, na VPS com compose.
- **Plano de entrega:** sites estáticos na Cloudflare, gerados pela imagem
  `site-builder` a partir da API de exportação e parametrizados por `SITE_ID`; SSR só
  para visualização.
- **Plano de eventos:** Worker de borda `/_e/*` → Analytics Engine + Cloudflare Queues
  → agregador.
- O **agregador é um entrypoint do backoffice**, ao lado do `backoffice-worker` e do
  `build-runner`. Uma única imagem do backoffice atende os quatro comandos (web, worker,
  build-runner, aggregator); cada um é um serviço no compose.
- Domínio em pacotes TypeScript agnósticos de framework; adaptador fino por framework;
  nada de fork por site.

## Alternativas consideradas

- `apps/aggregator` com imagem própria — mais isolado, mais uma unidade para manter.
- Worker consumidor na Cloudflare — exigiria alcançar o Postgres da VPS (Hyperdrive ou
  túnel).

## Consequências

- O backoffice é dono do schema do Postgres e das migrações.
- As imagens do GHCR são: backoffice (N comandos), generator (fase 2), site-builder.
