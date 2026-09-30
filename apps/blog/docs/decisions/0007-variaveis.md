# 0007 – Variáveis de ambiente

- Status: aceito
- Data: 2026-09-30

| Variável                               | Onde        | Uso                                                                                                    |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `SITE_ID`                              | build       | Site a construir                                                                                       |
| `CONTENT_SOURCE`                       | build e SSR | `api` ou `fixture`, sem valor padrão: a falta nunca faz um build de produção publicar dados de exemplo |
| `EXPORT_API_URL`, `EXPORT_BUILD_TOKEN` | build e SSR | Obrigatórios com `api`; o token nunca aparece em log nem em mensagem de erro                           |
| `SNAPSHOT_META_FILE`                   | build       | Opcional, absoluto; o render lê para o `result.json`                                                   |
| `PORT`                                 | SSR         | Porta do `blog-preview` (4321)                                                                         |
| `BLOG_OUTPUT`                          | build       | `preview` para o SSR (ADR 0002)                                                                        |

Validadas com Zod em `src/env.ts`. `dev` e `preview` carregam `../../.env.local`; o `build` usa só o ambiente (o render define tudo). No Turbo, as variáveis do build entram no hash; o token, por `passThroughEnv`.
