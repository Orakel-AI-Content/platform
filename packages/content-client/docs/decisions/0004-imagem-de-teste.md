# 0004 – Imagem Docker só de teste

- Status: aceito
- Data: 2026-09-29

Mesmo padrão do `content-model` e do `events`: `Dockerfile` com `turbo prune`, instalação e
`lint`, `typecheck` e `test`; alvo `content-client-test` no bake, fora dos grupos `images` e
`release` e fora do CI. Uso: `docker buildx bake content-client-test`.
