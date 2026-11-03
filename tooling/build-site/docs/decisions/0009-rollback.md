# 0009 – Rollback: entrypoint próprio e `rollback.json`

- Status: aceito
- Data: 2026-11-03

## Contexto

O backoffice vai reverter um site para uma versão já publicada (Story Orakel-AI-Content/workspace#21,
platform#508). O token de deploy só existe no container do site-builder (ADR 0002), então a operação
precisa ser um entrypoint da imagem, com o mesmo isolamento do `publish`.

## Decisão

- `node src/cli.ts rollback` com `SITE_ID`, `VERSION_ID` (o `versionId` do `publish.json`),
  `DEPLOY_TARGET` e o acesso ao alvo. Sem as variáveis do S3, porque o rollback não toca no
  build-cache.
- `DEPLOY_TARGET=cloudflare`: `wrangler rollback <VERSION_ID> --name orakel-<site> --message … --yes`,
  sem `--config`, porque o rollback não depende de render no volume e o nome do Worker é
  determinístico. Credencial ou configuração inválidas → permanente; o resto → transitória
  (mesma regra do `deploy`).
- `DEPLOY_TARGET=local`: `POST {EDGE_LOCAL_URL}/sites/{site}/rollback` com `{ id }` → `{ active }`.
  4xx → permanente; 5xx, 429, rede e versão ativa diferente da pedida → transitória.
- `VERSION_ID` é obrigatório: o "anterior à ativa" do edge-local não tem equivalente seguro na
  Cloudflare, e a escolha da versão fica com o backoffice.
- Escreve `/build/rollback.json` (`RollbackResultSchema` do `build-contract`, `formatVersion` 1)
  sempre, inclusive com env inválido quando o volume existe; o código de saída concorda (0/10/20).

## Alternativas consideradas

- Reaproveitar o `publish.json`: exige `cacheKey` e um render anterior, e o build-runner não
  saberia qual operação gerou o arquivo.
- `--config` com o `wrangler.cloudflare.jsonc` do volume: obrigaria um render antes de cada
  rollback.
- `vi.mock` de `child_process` nos testes: o binário do wrangler é parâmetro, e o teste roda o
  `execFile` real contra um wrangler simulado.

## Consequências

- O build-runner do backoffice executa o rollback como uma task própria (platform#513) e lê o
  `rollback.json`.
- Evolução aditiva do contrato: `result.json` e `publish.json` não mudam.
