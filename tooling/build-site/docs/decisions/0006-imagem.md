# 0006 – Imagem site-builder

- Status: aceito
- Data: 2026-09-30

- Base `node:24.21.0-bookworm-slim` por digest: o `workerd` do wrangler exige glibc. Uma base para os três entrypoints: a imagem é a release.
- `turbo prune @orakel/build-site @orakel/blog @orakel/blog-worker`: o blog **não** é dependência declarada do build-site, senão o `^build` do Turbo rodaria o `astro build` antes de todo typecheck e teste.
- A construção roda lint, typecheck e test do build-site, compila o tokens e faz o build `preview` do blog (servidor do `ssr`).
- Runtime: usuário `node`, `/build` do usuário `node` (volumes nomeados herdam), `RELEASE` pelo argumento do bake (`TAG`).
- O render entra na pasta do blog antes do build (parte dos caches do Astro é relativa ao diretório atual) e constrói numa pasta do container antes de copiar para `/build` (o Astro move arquivos com `rename`, que não atravessa volumes).

## Consequências

~1,2 GB (workspace com dependências de desenvolvimento): enxugar depois.
