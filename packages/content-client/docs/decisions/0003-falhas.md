# 0003 – Falhas como valor, classificadas em transitória ou permanente

- Status: aceito
- Data: 2026-09-29

## Decisão

- `readSnapshot` devolve `Result`; nunca lança por resposta ruim.
- Códigos: `network`, `http.<status>`, `truncated`, `json`, `schema.*`, `semantic.*`.
- `failureKind(issues)`: **transitória** se todos forem `network`, `http.5xx`, `http.429`,
  `truncated` ou `semantic.snapshot-structure` (corte: sem `end` ou contagens erradas);
  **permanente** no resto (token, site inexistente, conteúdo inválido).
- Nos loaders, a falha vira `SnapshotReadError` com `kind`, para o render escolher o código
  de saída (20 transitória, 10 permanente).

## Consequências

O `build-runner` repete as transitórias e pausa o site nas permanentes, sem precisar
interpretar a mensagem.
