# 0007 – Imagem Docker só de teste, com o build

- Status: aceito
- Data: 2026-09-29

Mesmo padrão de `content-model`, `events` e `content-client`, com o `build` incluído — é a verificação principal do pacote (contraste, conjunto fixo) e, num container limpo, prova que não depende da máquina local. Alvo `tokens-test` no bake, fora dos grupos `images` e `release` e fora do CI. Uso: `docker buildx bake tokens-test`.
