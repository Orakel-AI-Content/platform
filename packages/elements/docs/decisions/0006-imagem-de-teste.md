# 0006 – Imagem Docker só de teste

- Status: aceito
- Data: 2026-09-30

Mesmo padrão dos outros pacotes de domínio: `turbo prune`, instalação e `lint`, `typecheck` e `test` (happy-dom roda em Node, sem navegador); alvo `elements-test` fora dos grupos `images` e `release` e fora do CI. Uso: `docker buildx bake elements-test`.
