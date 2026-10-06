# 0007 – Variáveis de ambiente

- Status: aceito
- Data: 2026-09-30

| Variável               | Onde        | Uso                                                                                                    |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `SITE_ID`              | build       | Site a construir                                                                                       |
| `CONTENT_SOURCE`       | build e SSR | `api` ou `fixture`, sem valor padrão: a falta nunca faz um build de produção publicar dados de exemplo |
| `EXPORT_API_URL`       | build e SSR | Obrigatório com `api`                                                                                  |
| `EXPORT_BUILD_TOKEN`   | build       | Obrigatório com `api`: snapshot do build; nunca aparece em log nem em mensagem de erro                 |
| `EXPORT_PREVIEW_TOKEN` | SSR         | Obrigatório com `api`: snapshot de visualização; o SSR não recebe o token do build                     |
| `SNAPSHOT_META_FILE`   | build       | Opcional, absoluto; o render lê para o `result.json`                                                   |
| `PORT`                 | SSR         | Porta do `blog-preview` (4321)                                                                         |
| `BLOG_OUTPUT`          | build       | `preview` para o SSR (ADR 0002)                                                                        |

Validadas com Zod em `src/env.ts`, um schema por consumidor (`buildEnv`, `previewEnv`); o entrypoint `ssr` do build-site valida as do SSR no boot. `dev` e `preview` carregam `../../.env.local`; o `build` usa só o ambiente (o render define tudo). No Turbo, as variáveis do build entram no hash; o token, por `passThroughEnv`.
