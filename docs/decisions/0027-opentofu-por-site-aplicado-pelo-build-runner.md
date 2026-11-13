# 0027 – OpenTofu por site, aplicado pelo build-runner

- Status: aceito
- Data: 2026-11-13

## Contexto

A ADR-021 dos requisitos (`docs/platform-requirements/decisoes.md`, no repositório de
planejamento) previa uma raiz OpenTofu única em `infra/`, com `for_each` sobre a lista de sites
exportada pelo Backoffice (`sites.auto.tfvars.json`), um estado único e `plan`/`apply` só na
máquina da pessoa operadora. A senha do estado e o token do bucket `tofu-state` ficariam só com
ela. A workspace#96 muda isso: a infraestrutura de cada site passa a ser criada pelo Backoffice,
por botão, com o plano mostrado antes da confirmação. Esta ADR revê a ADR-021 para esse fluxo.

## Decisão

- **Um estado por site.** A raiz `infra/site` é aplicada uma vez por site, com
  `-var site_id=<SITE_ID>`. O backend S3 aponta para o bucket `tofu-state` do R2, com a chave
  `sites/<SITE_ID>.tfstate` e `use_lockfile = true`. O `SITE_ID` não muda, então a chave
  também não muda. O backend e a cifragem usam variáveis, pela avaliação antecipada do OpenTofu
  (≥ 1.8).
- **Módulo `infra/modules/site`**, com o provider `cloudflare/cloudflare` v5 fixado. Ele declara:
  - a zona;
  - HSTS, TLS mínimo 1.2 e Always Use HTTPS;
  - o Tiered Cache;
  - o SPF `v=spf1 include:_spf.mx.cloudflare.net -all` e o DMARC `p=reject`;
  - o Email Routing: uma regra por endereço de contato e o _catch-all_ com a ação `drop`.

  A raiz expõe `name_servers`.

- **Estado e plano cifrados** pelo próprio OpenTofu: _key provider_ `pbkdf2`, método `aes_gcm`,
  com `enforced = true`. A senha chega por `TF_VAR_state_passphrase` e nunca fica em arquivo
  versionado.
- **`plan` e `apply` rodam na VPS**, pelo build-runner, numa imagem própria (`infra-runner`,
  platform#823). O plano salvo é aplicado tal como foi gerado.
- **Segredos na VPS, só no container de infra.** O token de infra da Cloudflare fica restrito ao
  IP da VPS e tem expiração. A credencial do `tofu-state` e a senha do estado ficam no ambiente
  da VPS. Nenhum outro processo recebe esses segredos.
- **Nenhum recurso de conta no módulo `site`.** Com um estado por site, um recurso da conta
  colidiria entre os sites, e remover um site o apagaria para todos. Por isso o endereço de
  destino do Email Routing (`cloudflare_email_routing_address`), os buckets e os tokens ficam
  fora do módulo.
- **Crawler Hints fora do módulo.** O provider v5 (conferido na 5.28.1) não tem recurso nem
  `setting_id` para ele: na API, é uma _flag_ de produto da zona, não um _zone setting_. O
  `apply` do `infra-runner` o liga depois do `tofu apply`, pela rota de flags da zona
  (`POST /zones/{zone_id}/flags/products/cache/changes`, `crawlhints_enabled`), com o mesmo
  token. Essa rota não é documentada pela Cloudflare (platform#823): a falha não derruba o
  `apply`, só marca `crawlerHints: "falhou"` no resultado, e o passo 6 abaixo é a alternativa.
- O CI roda `tofu fmt -check` e `tofu validate`, sem credenciais (`init -backend=false`).

### Passos manuais

Os detalhes e os comandos ficam em `infra/site/README.md`.

1. Criar o bucket `tofu-state` no R2, privado, e um token S3 do R2 só com escrita nesse bucket.
2. Criar o token de infra da Cloudflare, restrito ao IP da VPS e com validade. Ele precisa das
   permissões de zona, configurações da zona, DNS e Email Routing, na conta da rede de sites.
3. Gerar a senha do estado (no mínimo 16 caracteres). Guardá-la no ambiente da VPS e numa
   cópia offline, junto da chave dos backups.
4. Criar e verificar, uma vez, o endereço de destino do Email Routing na conta (a caixa
   central).
5. Depois de cada `apply` de um site novo, trocar os nameservers no registrador pelos da saída
   `name_servers`.
6. Só se o `apply` registrar `crawlerHints: "falhou"` (ou num `apply` à mão): ligar o Crawler
   Hints na zona, em painel → Caching → Configuration → Crawler Hints.

## Alternativas consideradas

- **Estado único com `for_each`** (ADR-021): um `apply` errado atinge todos os sites, e o
  Backoffice teria de regenerar e versionar a lista de sites a cada site novo.
- **`plan`/`apply` só na máquina da pessoa operadora** (ADR-021): impede o botão no Backoffice.
- **Chave do backend montada por script** (`-backend-config`): a chave sai do código e o
  `tofu validate` não a confere.
- **Endereço de destino do e-mail no módulo `site`**: duplicata no segundo site.
- **Crawler Hints por `local-exec` com `curl`**: fica fora do `plan` e exige `curl` e o token
  dentro do módulo.

## Consequências

- A ADR-021 e a seção 4 do `05-infra-e-operacao.md` dos requisitos ficam desatualizadas até a
  revisão no repositório de planejamento (pendência registrada na workspace#96).
- A exportação `sites.auto.tfvars.json` (ADR 0011 do Backoffice) perde o uso. Ela é retirada na
  platform#827.
- Um token vazado só funciona a partir do IP da VPS. A senha perdida obriga a reconstruir o
  estado do site por importação.
- O travamento do R2 com `use_lockfile` e o SPF ao lado do registro que o Email Routing cria só
  se confirmam no primeiro `apply` real (fase 12.1 dos requisitos).

## Revisão (2026-11-13)

A platform#822 completa o módulo `site` com o que a seção 4.1 do `05-infra-e-operacao.md` dos
requisitos atribui ao OpenTofu. O módulo passa a declarar também:

- o registro `www` com proxy e o redirect dele para o domínio raiz;
- a regra de rate limiting em `/_e/*`, com o limiar em variável;
- a regra do WAF para os crawlers de treinamento, com a lista em variável;
- o bot management: Bot Fight Mode e `robots.txt` gerenciado desligados, bloqueio de crawlers
  de IA ligado (ADR-026);
- o bucket `media-<SITE_ID>` com `prevent_destroy`, o domínio `media.<domínio>`, o `r2.dev`
  desligado e a regra de cache da mídia.

O bucket de mídia é recurso da conta, mas tem nome por site: não colide entre os estados. A
regra "nenhum recurso de conta no módulo" vale para os recursos compartilhados. O token de
infra ganha as permissões dessas regras e do R2 (`infra/site/README.md`).
