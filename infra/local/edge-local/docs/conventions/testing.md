# Testes do edge-local

- `pnpm test` (~2 s): `store.test.ts` e `supervisor.test.ts` com runtime falso; `fidelity.test.ts` sobe o wrangler de verdade (o spike da L0) com o Worker real do blog.
- `makeArchive(site, rótulo)` gera o `tar.gz` no formato do publish; o Worker do blog é empacotado uma vez por execução.
- Requisições ao proxy com `http.request` (manda o `Host`); o `fetch` do Node ignora esse cabeçalho.
- Versões ficam sem escrita: limpe pastas de teste com `removeTree`.
- A construção da imagem roda os mesmos testes, em Linux.
