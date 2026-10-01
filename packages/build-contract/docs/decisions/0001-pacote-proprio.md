# 0001 – Contrato do volume num pacote próprio

- Status: aceito
- Data: 2026-10-01

## Contexto

O contrato do volume `/build` (ADR 0002 do build-site) ficava no subcaminho
`@orakel/build-site/contract`. Na L3, o `build-runner` do backoffice passou a ler o
`result.json` e o `publish.json`; importar o `@orakel/build-site` faria o `turbo prune` e o
`pnpm install --prod` levarem astro, wrangler e o binário `workerd` (~124 MB) para a imagem do
backoffice, que não os usa. O `edge-local` já sofria o mesmo só pelo `ARCHIVE_LAYOUT`.

## Decisão

- `packages/build-contract` (`@orakel/build-contract`, camada `domain`, só Zod) com o conteúdo
  do antigo `src/contract.ts`, sem mudança de formato (`CONTRACT_VERSION` 1).
- build-site, backoffice e edge-local importam daqui; o subcaminho `./contract` do build-site
  deixa de existir.

## Alternativas consideradas

- Importar o build-site mesmo assim: imagem do backoffice algumas centenas de MB maior.
- Schema próprio no backoffice: duplicaria o contrato, com risco de divergência silenciosa.

## Consequências

- O `edge-local` deixa de depender do build-site.
- Imagem só de teste (como as dos outros pacotes): não criada; o pacote é pequeno e roda no CI.
