# Estrutura de pastas do events

Consulte para saber onde criar cada arquivo.

```
packages/events/
├── package.json            # exports ".", "./v1", "./v1/client"; sideEffects: false
├── Dockerfile              # só de teste (ADR 0006)
└── src/
    ├── index.ts            # ".": SUPPORTED_FORMAT_VERSIONS, Result, Issue
    ├── result.ts
    └── v1/
        ├── index.ts        # "./v1": Worker, build e agregador
        ├── version.ts  routes.ts  session.ts  layout.ts      # sem Zod
        ├── payload.ts  manifest.ts                           # com Zod
        ├── test-builders.ts
        └── client/         # "./v1/client": navegador, sem dependências
            ├── tsconfig.json   # tipos do DOM só aqui
            ├── tracker.ts
            └── index.ts
```

Testes ao lado do código (`*.test.ts`).

## Como acrescentar

**Um campo no payload (aditivo):** campo opcional no schema em `payload.ts`; se for
gravado, posição nova no fim de `BLOB_FIELDS` em `layout.ts` e teste posição por posição.

**Um tipo de evento (ex.: clique, na fase 3):** schema em `payload.ts` no
`EventPayloadSchema`; valor em `EVENT_TYPES`; função `<tipo>DataPoint` em `layout.ts`;
envio no `client/`; campos novos do manifesto como opcionais.

**Um motivo de descarte:** valor em `DISCARD_REASONS`.

**Uma versão nova (incompatível):** copie `src/v1/` para `src/v2/`, mude
`FORMAT_VERSION`, acrescente `./v2` e `./v2/client` no `exports` e `2` em
`SUPPORTED_FORMAT_VERSIONS`; o agregador passa a ler as duas.
