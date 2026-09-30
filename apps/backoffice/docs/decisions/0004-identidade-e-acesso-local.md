# 0004 – Identidade pelo Access e acesso local com Caddy + access-mock

- Status: aceito
- Data: 2026-09-29

## Contexto

Em produção, o Cloudflare Access põe o JWT em `Cf-Access-Jwt-Assertion`. A entrada pede o
mesmo contrato no local (`access-mock`) e `https://admin.orakel.localhost`; o compose da
raiz não tinha Caddy nem emissor de JWT.

## Decisão

- `verifyAccessToken` (`jose`): JWKS remoto, `iss = https://<ACCESS_TEAM_DOMAIN>`,
  `aud = ACCESS_AUD`, RS256; o e-mail identifica a pessoa em `users`, e os papéis vêm de
  `user_roles`. Qualquer falha é `unauthorized`, sem detalhe.
- `requireRole` no domínio; o `proxy.ts` do Next só redireciona.
- Tokens internos (`EXPORT_BUILD_TOKEN`, `EXPORT_PREVIEW_TOKEN`, `GENERATOR_TOKEN`),
  comparados em tempo constante; cada rota aceita só o do seu consumidor.
- Local: `infra/local/access-mock/server.ts` (sem dependências, rodado pelo Node 24) e
  Caddy com `tls internal` e `forward_auth`. `/api/export/*` e `/api/internal/*`
  respondem 404 no hostname público; em produção, o ingress do Tunnel faz o mesmo.
- O app só troca `ACCESS_*`: não existe caminho de autenticação "de desenvolvimento".

## Alternativas consideradas

- Atalho `ACCESS_DEV_EMAIL` no app: caminho que produção não tem.
- Adiar o acesso local: ninguém entraria na interface até o ambiente local completo.

## Consequências

O navegador precisa confiar na CA interna do Caddy (guia de ambiente local da raiz).
