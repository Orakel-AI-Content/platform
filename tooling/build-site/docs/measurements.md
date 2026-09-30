# Medições do render (fase 0, L3)

Primeira estimativa para os gatilhos de escala (`12`, seção 5). Render real (`node src/cli.ts
render`, astro build + Pagefind + verificações) contra o `snapshot-server`, com o snapshot
sintético de `scripts/synthetic-snapshot.ts` (10 categorias, 30 tags, 5 autores, 20 mídias; cada
artigo com sumário, texto, imagem e FAQ).

**Máquina:** Apple M5 Pro × 15, 24 GB; Node 24.21.0; macOS, fora de container; 3 rodadas por
tamanho. Data: 2026-09-30. Comando: `pnpm --filter @orakel/build-site measure 100,1000,5000 3`.

| Artigos | p50    | p90    | Páginas | Arquivos | Artefato |
| ------- | ------ | ------ | ------- | -------- | -------- |
| 100     | 1,0 s  | 1,1 s  | 163     | 292      | 4,1 MB   |
| 1.000   | 2,8 s  | 4,0 s  | 1.423   | 2.461    | 33,3 MB  |
| 5.000   | 11,5 s | 12,0 s | 7.013   | 12.073   | 216,3 MB |

## Leitura

- **Arquivos por versão:** ~2,4 arquivos por artigo (página, fragmento do Pagefind, paginação,
  taxonomias). Com o limite de 100.000 arquivos por versão do Worker (`05`, seção 3.3), a folga é
  de ~40.000 artigos por site.
- **Duração:** cresce quase linear (~2,2 ms por artigo acima de 1.000). O publish (upload dos
  assets) não está medido: depende da rede e do `wrangler`.
- **Limites desta medição:** máquina de desenvolvimento, sem o `--cpus=3 --memory=6g` do container
  da VPS e sem o overhead da rede `export`. Medir de novo no piloto (fase 1), na VPS, com a
  imagem `site-builder` e o `build-runner` real.
