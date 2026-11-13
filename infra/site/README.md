# infra/site

A raiz OpenTofu de **um site** cria a zona, as configurações, o DNS, o e-mail, as regras da
zona e o bucket de mídia desse site (ADR 0027). Ela usa o módulo `../modules/site`. Cada site tem o seu próprio estado,
`sites/<SITE_ID>.tfstate`, no bucket `tofu-state` do R2. O estado e o plano são cifrados.

Quem roda o `plan` e o `apply` é o build-runner, na VPS, pela imagem `infra-runner`
(platform#823). Os comandos abaixo servem também para rodar à mão, a partir de uma máquina
com o IP liberado no token.

## Passos manuais (uma vez por conta)

1. **Bucket `tofu-state`.** No R2, crie um bucket privado `tofu-state`. Depois, em R2 →
   **Manage API Tokens → Create API token**, crie um token com permissão **Object Read & Write**
   só nesse bucket. Guarde o _Access Key ID_ e o _Secret Access Key_.
2. **Token de infra da Cloudflare.** Em **My Profile → API Tokens → Create Token → Custom
   token**, crie o token com:
   - recurso **Include → All zones from an account**, na conta da rede de sites;
   - **Client IP Address Filtering** só com o IP da VPS;
   - validade definida (renove antes de vencer);
   - as permissões abaixo.

   | Grupo   | Permissão                     | Acesso |
   | ------- | ----------------------------- | ------ |
   | Account | Account Settings              | Read   |
   | Zone    | Zone                          | Edit   |
   | Zone    | Zone Settings                 | Edit   |
   | Zone    | DNS                           | Edit   |
   | Zone    | Email Routing Rules           | Edit   |
   | Zone    | Cache Settings (Tiered Cache) | Edit   |
   | Zone    | Cache Rules                   | Edit   |
   | Zone    | Dynamic URL Redirects         | Edit   |
   | Zone    | Zone WAF                      | Edit   |
   | Zone    | Bot Management                | Edit   |
   | Account | Workers R2 Storage            | Edit   |

   As regras da zona (redirect do `www`, rate limiting, WAF e cache da mídia) são _rulesets_,
   um por fase. O R2 é recurso da conta: o token cria o bucket `media-<SITE_ID>` e o domínio
   `media.<domínio>`.

   A criação de zona também exige **Account → Zone → Edit**. Se o painel separar as duas,
   dê as duas.

3. **Senha do estado.** Gere uma senha com pelo menos 16 caracteres, por exemplo com
   `openssl rand -base64 32`. Guarde-a no ambiente da VPS e numa cópia offline, junto da chave
   dos backups. Sem ela, o estado não abre e precisa ser reconstruído por importação.
4. **Destino do e-mail.** Em **Email → Email Routing → Destination addresses**, cadastre a
   caixa central uma única vez e confirme o e-mail de verificação. O endereço é da conta, não
   da zona, por isso não fica no módulo: com um estado por site, ele seria criado de novo a
   cada site.

## Passos manuais (por site)

1. **Nameservers.** Depois do `apply`, troque no registrador os nameservers do domínio pelos
   da saída `name_servers`.
2. **Crawler Hints.** O provider v5 não o declara. Ligue em **Caching → Configuration →
   Crawler Hints**, na zona do site.

## Execução

As credenciais entram só pelo ambiente:

```sh
export CLOUDFLARE_API_TOKEN=...        # token de infra (passo 2)
export AWS_ACCESS_KEY_ID=...           # token S3 do tofu-state (passo 1)
export AWS_SECRET_ACCESS_KEY=...
export TF_VAR_state_passphrase=...     # senha do estado (passo 3)
```

As variáveis do site entram por `-var`. O `SITE_ID` define a chave do estado, por isso ele vai
também no `init`:

```sh
cd infra/site
vars="-var site_id=<SITE_ID> -var cloudflare_account_id=<conta> -var domain=<domínio> -var email_forward_to=<caixa central>"
tofu init -reconfigure $vars
tofu plan $vars -out=site.tfplan     # leia o plano
tofu apply site.tfplan
tofu output name_servers
```

Por padrão, só `contato@<domínio>` é encaminhado. Para outros endereços, passe
`-var 'email_aliases=["contato","imprensa"]'`. Qualquer outro endereço é descartado.

## O que o módulo cria além da zona e do e-mail

- **`www`**: um registro `AAAA 100::` com proxy e uma regra que redireciona (301) para o
  domínio raiz, com caminho e query. O domínio raiz é do `wrangler`.
- **Rate limiting** em `/_e/*`: a única regra do plano Free, 10 s por IP e por data center.
  O limiar é `events_rate_limit_requests` (padrão 200).
- **WAF**: uma regra que bloqueia os user-agents de `training_crawler_user_agents`, os crawlers
  de treinamento de `packages/core/src/crawlers.ts` sem os tokens `-Extended`. Revise as duas
  listas juntas a cada trimestre.
- **Bot management**: Bot Fight Mode e `robots.txt` gerenciado desligados, bloqueio de
  crawlers de IA da Cloudflare ligado (ADR-026).
- **Mídia**: bucket `media-<SITE_ID>` com `prevent_destroy`, domínio `media.<domínio>`
  (TLS 1.2), `r2.dev` desligado e cache de borda de um ano para esse host. Para remover um
  site, esvazie o bucket e retire o `prevent_destroy` antes do `destroy`.

## A validar no primeiro `apply` real

- O travamento do estado no R2 com `use_lockfile`.
- O SPF do módulo (`v=spf1 include:_spf.mx.cloudflare.net -all`) ao lado do registro que o
  Email Routing cria ao ser ligado. Se surgir um segundo SPF, remova o da Cloudflare e mantenha
  o do módulo.
- Que o plano Free aceita a regra de rate limiting como declarada (campos, `wildcard` e
  `mitigation_timeout` de 10 s) e a regra do WAF com `lower()`.
- Que o bloqueio de crawlers de IA da Cloudflare não atinge os bots de busca por IA que a P10
  libera (`PerplexityBot`, `OAI-SearchBot` e os demais `ai-search`).
- Que o cookie `__cf_bm` não é gravado e que o rate limiting não atinge leitores reais.

## CI

O CI roda `tofu fmt -check -recursive infra` e `tofu validate` nesta raiz, com
`init -backend=false`, sem nenhuma credencial.
