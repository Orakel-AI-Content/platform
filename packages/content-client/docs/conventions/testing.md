# Testes do content-client

- `src/v1/test-server.ts` sobe um servidor HTTP local que exige o token e serve NDJSON em
  pedaços (`chunkSize`), com status e corte (`abortAfter`) configuráveis.
- Os casos cobrem: fixtures do `content-model` em pedaços pequenos, linha partida no meio
  de um caractere, CRLF, campo desconhecido, 401, 404, 500, corte sem `end`, conexão
  caída, linha inválida e falha de rede.
- Loaders: `fakeContext()` com `store` em memória e `parseData` identidade; confere uma
  requisição para várias coleções e o `metaFile`.
- Sem meta de cobertura. Rodar: `pnpm test` · da raiz: `pnpm turbo run test --filter=@orakel/content-client`.
