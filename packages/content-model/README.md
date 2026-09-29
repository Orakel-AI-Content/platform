# @orakel/content-model

Contrato de conteúdo e configuração de site da plataforma Orakel AI: schemas Zod
versionados, recursos suportados por versão e validação semântica. O backoffice valida o
que envia; o `content-client`, o blog e o build validam o que consomem.

## Uso

```ts
import { ContentSchema, parseSnapshotLine, validateSnapshot } from '@orakel/content-model/v1';

const line = parseSnapshotLine(JSON.parse(ndjsonLine)); // Result<SnapshotLine>
const site = validateSnapshot(lines); // Result<Snapshot>: estrutura, referências, slugs, n, recursos
if (!site.ok) console.error(site.issues); // [{ code, message, path }]
```

Fixtures dos sites de exemplo: `@orakel/content-model/fixtures/v1/exemplo-a.ndjson` e
`exemplo-b.ndjson`.

## Comandos (nesta pasta)

| Comando          | O que faz                          |
| ---------------- | ---------------------------------- |
| `pnpm test`      | Vitest com cobertura (meta de 90%) |
| `pnpm lint`      | ESLint (preset `domain`)           |
| `pnpm typecheck` | `tsc --noEmit`                     |

Em container limpo, da raiz: `docker buildx bake content-model-test`.

## Documentação

`docs/README.md` (desta pasta) e, para o sistema, `docs/` da raiz.
