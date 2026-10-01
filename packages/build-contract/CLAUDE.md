# build-contract

Contrato do volume `/build` (schemas Zod de `result.json` e `publish.json`, caminhos, códigos
de saída, layout do `tar.gz` do publish). Escrito pelo site-builder (`tooling/build-site`),
lido pelo `build-runner` do backoffice e pelo `edge-local`. Parte do monorepo — regras gerais
no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` · Lint / tipos: `pnpm lint` · `pnpm typecheck`

## Regras invioláveis

- Só Zod: nenhuma dependência do site-builder (é o motivo do pacote existir).
- Mudança aditiva mantém `CONTRACT_VERSION`; incompatível sobe a versão e os dois lados
  (build-site e backoffice) mudam no mesmo PR.
- Arquivo de resultado e código de saída sempre concordam (`exitCodeOf`).

## Documentação

- `docs/decisions/0001-pacote-proprio.md` – por que o contrato saiu do build-site
- `tooling/build-site/docs/decisions/0002-contrato-do-volume.md` – o contrato em si
