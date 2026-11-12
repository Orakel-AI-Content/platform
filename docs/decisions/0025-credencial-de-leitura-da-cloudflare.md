# 0025 – Credencial de leitura da Cloudflare no worker

- Status: aceito
- Data: 2026-11-12

## Contexto

As etapas "Infra aplicada" e "Zona ativa" do ciclo de vida do site (workspace#85) passam a
ser conferidas pelo Backoffice, sem alguém marcá-las à mão. Para isso, ele precisa perguntar à
Cloudflare se a zona do domínio principal existe na conta e se está `active`. A conferência
roda no `backoffice-worker` (job periódico e "Conferir agora"). Até aqui, a única credencial da
Cloudflare na VPS é o `CLOUDFLARE_API_TOKEN` de deploy, que só o `build-runner` tem e só repassa
ao container `publish` (ADRs 0010 e 0011).

## Decisão

- Um token novo, `CLOUDFLARE_ZONE_READ_TOKEN`, só com a permissão **Zone: Read** na conta
  (`CLOUDFLARE_ACCOUNT_ID`), apenas no serviço `backoffice-worker` do `infra/vps/compose.yaml`.
  O web e o build-runner não o recebem; o token de deploy continua só no build-runner e no
  `publish`.
- O worker o lê por um schema próprio (`ZoneCheckEnvSchema` em `apps/backoffice/src/env.ts`),
  fora do `EnvSchema` que o web também usa. Com `DEPLOY_TARGET=cloudflare`, ele exige o token e
  a conta; com `local`, exige o `EDGE_LOCAL_URL`.
- A consulta (`apps/backoffice/src/lib/cloudflare.ts`) é `fetch` puro, uma chamada
  (`GET /zones?name=<domínio>&account.id=<conta>`), no molde do `lib/github.ts` (ADR 0022). O
  resultado é `inexistente`, `pendente`, `ativa` ou `falha`; a falha é um valor, com
  `transient` para rede, falta de resposta, 429 e 5xx, e nunca vira "pendente".
- O token só vai no cabeçalho `Authorization`; nenhuma mensagem de falha o repete (o texto do
  provedor passa por uma limpeza antes).
- No local não existe zona: `DEPLOY_TARGET=local` dá a zona como ativa quando o edge-local
  responde ao `/healthz`.

### Passos manuais

1. Criar o token: Cloudflare → **My Profile → API Tokens → Create Token → Custom token**,
   permissão **Zone → Zone → Read**, recurso **Include → All zones from an account** (a conta
   da rede de sites), com validade (renovar antes de vencer).
2. Gravar `CLOUDFLARE_ZONE_READ_TOKEN` no ambiente da VPS e recriar só o `backoffice-worker`.

A criação do token pelo OpenTofu (módulo `shared`) fica para a fase 1 da infraestrutura.

## Alternativas consideradas

- Reaproveitar o `CLOUDFLARE_API_TOKEN` de deploy no worker: um segredo que publica Workers
  passaria a um processo a mais, que não publica nada; um vazamento do worker viraria
  capacidade de deploy.
- Conferir no build-runner, com o token de deploy: mistura a fila de builds (concorrência 2)
  com uma consulta de segundos a cada 5 minutos por site, e ainda usa permissão de escrita para
  ler.
- Token no `backoffice-web`, conferindo de forma síncrona no "Conferir agora": põe o segredo no
  processo exposto à internet e prende a requisição ao tempo da Cloudflare.
- Campos no `EnvSchema`: o web receberia o token pelo mesmo schema.

## Consequências

- Mais um segredo para criar e renovar. Vencido ou revogado, a conferência devolve "a
  Cloudflare recusou a credencial" e as etapas não avançam sozinhas até trocar o token e
  recriar o worker.
- Um vazamento do token só expõe a lista e o estado das zonas da conta, sem escrita.
- O worker passa a precisar de saída para a internet (`api.cloudflare.com`), que a rede
  `internal` já tem.
