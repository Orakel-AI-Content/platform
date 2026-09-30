# 0008 – Medições manuais, registradas

- Status: aceito
- Data: 2026-09-30

`scripts/synthetic-snapshot.ts` gera o snapshot sintético e `scripts/measure.ts` roda o render real (processo separado) contra o `snapshot-server`, imprimindo p50, p90, páginas, arquivos e tamanho. Fora do CI (depende da máquina). Resultados em `docs/measurements.md`; medir de novo na VPS no piloto.
