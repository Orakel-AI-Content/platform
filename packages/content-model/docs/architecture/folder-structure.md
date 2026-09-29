# Estrutura de pastas do content-model

Consulte para saber onde criar cada arquivo.

```
packages/content-model/
├── package.json            # exports ".", "./v1", "./fixtures/v1/*"
├── Dockerfile              # só de teste (ADR 0005)
├── fixtures/v1/            # snapshots NDJSON dos sites de exemplo (exemplo-a, exemplo-b)
└── src/
    ├── index.ts            # ".": versões suportadas, Result, Issue
    ├── result.ts           # Result, Issue, parseWith
    ├── fixtures.test.ts    # toda fixture de toda versão passa no schema e na semântica
    └── v1/
        ├── index.ts        # superfície pública de ./v1
        ├── version.ts      # SCHEMA_VERSION
        ├── resources.ts    # ResourcesSchema e RESOURCES
        ├── common.ts       # primitivos
        ├── snapshot.ts     # SnapshotLineSchema e parseSnapshotLine
        ├── test-builders.ts  # dados válidos para os testes (fora da superfície pública)
        ├── blocks/         # um arquivo por tipo de bloco + rich-text + base (n)
        ├── entities/       # um arquivo por entidade
        └── semantic/
            ├── index.ts    # validateSnapshot, validateContent, validateSiteConfig
            ├── types.ts    # Snapshot, ReferenceContext
            └── rules/      # uma regra por arquivo
```

Testes ficam ao lado do código (`*.test.ts`).

## Como acrescentar

**Um tipo de bloco (mudança aditiva da v1):**

1. `src/v1/blocks/<tipo>.ts` com o schema (`...blockBase`, `type: z.literal('<tipo>')`).
2. Inclua em `BlockSchema` e reexporte em `blocks/index.ts`.
3. Acrescente o tipo em `BLOCK_TYPES` (`resources.ts`).
4. Testes em `blocks/blocks.test.ts`; um exemplo numa fixture.

**Um preset ou uma variante:** acrescente o valor em `RESOURCES` (`resources.ts`), no
mesmo PR em que o blog o implementa.

**Um tipo de página ou um componente com variante:** campo opcional novo em
`SitePresetsSchema` ou `SiteVariantsSchema`, mais a chave em `RESOURCES`. Obrigatório
só numa versão nova.

**Uma regra semântica:** `src/v1/semantic/rules/<regra>.ts` com `check<Regra>()`,
chamada em `semantic/index.ts`, testada em `semantic.test.ts`.

**Uma versão nova (mudança incompatível):**

1. Copie `src/v1/` para `src/v2/`, mude `SCHEMA_VERSION` e aplique a mudança;
   reaproveite por import de `../v1/` o que não mudou.
2. `exports`: `"./v2"` e `"./fixtures/v2/*"`; `fixtures/v2/`.
3. Acrescente `2` em `SUPPORTED_SCHEMA_VERSIONS` e o validador em `src/fixtures.test.ts`.
4. ADR na raiz: é major do core.
