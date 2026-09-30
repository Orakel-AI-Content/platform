# 0011 – Imagem Docker só de teste

- Status: aceito
- Data: 2026-09-30

Mesmo padrão dos outros pacotes de domínio: `Dockerfile` com `turbo prune`, instalação e `lint`, `typecheck` e `test` (com a meta de 90%); alvo `core-test` no bake, fora dos grupos `images` e `release` e fora do CI. Uso: `docker buildx bake core-test`.
