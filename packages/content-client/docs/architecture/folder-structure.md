# Estrutura de pastas do content-client

```
src/
├── index.ts          ".": CLIENT_SCHEMA_VERSIONS, snapshotUrl, failureKind
├── failures.ts
└── v1/
    ├── index.ts      "./v1": readSnapshot, ndjsonLines, writeSnapshotMeta
    ├── ndjson.ts  read-snapshot.ts  meta-file.ts
    ├── test-server.ts   servidor HTTP dos testes (fora da superfície pública)
    └── astro/        "./v1/astro": snapshotLoaders, SnapshotReadError
```

**Coleção nova:** entidade nova no snapshot (content-model) → `SNAPSHOT_COLLECTIONS` e o
`switch` de `entries()` em `astro/loaders.ts` → teste com `fakeContext`.

**Versão nova da API (v2):** `src/v2/` com o `@orakel/content-model/v2`, subcaminhos
`./v2` e `./v2/astro`, e `2` em `CLIENT_SCHEMA_VERSIONS`. A release que usa a v2 importa
só a v2.

**Leitura ao vivo:** `src/v1/live.ts` (cliente das rotas de visualização) e um live loader em
`src/v1/astro/`, no mesmo PR das rotas do backoffice.
