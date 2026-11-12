# 0024 – Prévia gerenciada pelo build-runner

- Status: aceito (revisa o 0010 e o 0011: o `build-runner` cria a prévia nas redes `internal` e
  `export`)
- Data: 2026-11-12

## Contexto

A prévia dos rascunhos (`blog-preview`, entrypoint `ssr` do `site-builder`) é um serviço do
compose com a tag de `SITE_BUILDER_TAG`. Ela precisa seguir a release corrente sem ação de
ninguém e sem cair na troca (workspace#84). O Backoffice só alcança o Docker pelo
`docker-socket-proxy`, que libera criar, iniciar, matar, apagar e ler containers (ADR 0011), mas
não redes nem `restart`.

## Decisão

- O `build-runner` cria e troca o container da prévia pelo `ContainerRuntime`, como já faz com o
  `render` e o `publish`. O serviço `blog-preview` do compose sai depois (platform#709).
- Tipo próprio no runtime para container de serviço (`ServiceSpec`, `startService`): várias
  redes com apelido, healthcheck, restart `unless-stopped`, sem volume e sem limites de render.
  Mesmas garantias do `start`: `CapDrop: ALL`, `no-new-privileges` e só a imagem
  `SITE_BUILDER_IMAGE:<tag>`, conferida antes de chegar ao Docker.
- A prévia entra em `orakel-internal` e `orakel-export` com o apelido `blog-preview`: o upstream
  do Caddy (`blog-preview:4321`) não muda. Na tabela do 0010, `blog-preview` passa a ser um
  container do `build-runner`, nas mesmas redes.
- Várias redes no `containers/create` exigem a API 1.44 (Docker Engine 25). O create do serviço
  vai em `/v1.44/containers/create`, aceito pelo regex atual do proxy: um Engine mais antigo
  recusa a versão com erro explícito, em vez de ligar o container a uma rede só. Requisito: Docker
  Engine ≥ 25 na VPS.
- A saúde é lida de `GET /containers/<id>/json` (`starting`, `healthy`, `unhealthy`; `absent`
  no 404; container parado ou sem healthcheck nunca conta como saudável).
- Nenhuma rota nova no proxy, nem na VPS nem no local.

## Alternativas consideradas

- Criar numa rede e ligar a segunda por `POST /networks/<id>/connect`: exigiria liberar redes no
  proxy, que o 0011 recusa.
- Serviço do compose trocado por um agente no host (`docker compose up -d`): código fora do
  Backoffice, sem teste no CI, e a prévia cai alguns segundos a cada troca.
- Tag flutuante e `restart`: pediria `images/tag` e `containers/restart` no proxy da VPS (o 0023
  recusou o primeiro) e também derruba a prévia.
- Estender o `ContainerSpec` com campos opcionais: o render perderia a garantia de volume
  obrigatório e rede única, e o `start` ganharia ramos.

## Consequências

- A VPS precisa de Docker Engine ≥ 25 antes do deploy da troca da prévia.
- O `build-runner` passa a ser dono de um container que sobrevive a ele (restart
  `unless-stopped`): a reconciliação no boot é dele (platform#708).
- Containers de serviço novos (além da prévia) seguem o mesmo tipo, sem mudar o proxy.
