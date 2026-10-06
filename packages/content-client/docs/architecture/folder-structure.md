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

**Snapshot de visualização:** o mesmo `readSnapshot` com `kind: 'preview'` (rota
`preview-snapshot`, token da visualização); não há cliente ao vivo nem live loader (ADR 0009
do backoffice). Rota nova da API → caminho em `SNAPSHOT_ROUTES` de `src/index.ts`.
