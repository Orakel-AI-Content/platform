# 0007 – Divergências da entrada

- Status: aceito
- Data: 2026-09-29

| A entrada dizia                  | Ficou                                                 | Por quê                                                                     |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| MinIO no local                   | SeaweedFS (da raiz)                                   | O MinIO deixou de publicar imagens da edição comunitária (ADR 0008 da raiz) |
| Agregador no `backoffice-worker` | Igual à entrada; a raiz é que muda (ADR 0009 da raiz) | Job horário não justifica um processo próprio                               |
| Next.js e React sem versão       | Next 16.3.6, React 19.3.0                             | A 16.3.7 saiu há menos de 24 h (`minimumReleaseAge`)                        |
| react-hook-form, TipTap          | Fora desta geração                                    | Entram com os formulários e o editor (backlog)                              |
