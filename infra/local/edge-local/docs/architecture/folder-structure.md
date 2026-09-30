# Estrutura de pastas do edge-local

```
src/
├── server.ts       entrada (portas, ae-sim, restore, /healthz pronto)
├── env.ts  store.ts  runtime.ts  supervisor.ts  proxy.ts  admin.ts
├── ae-sim/worker.js   Worker do ae-sim (workerd; fora do tsc)
├── test-archive.ts    arquivos de teste no formato do publish, com o Worker real
└── *.test.ts          store, supervisor (runtime falso), fidelity (runtime real)
```

**Rota nova na administração:** `admin.ts` + caso no `supervisor.test.ts`. **Mudança no formato do arquivo:** primeiro o `ARCHIVE_LAYOUT` do build-site, depois `Store.validate`. **Nova checagem de fidelidade:** caso no `fidelity.test.ts` e linha no ADR 0004.
