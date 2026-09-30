# Testes do Worker de borda

Complementa `docs/conventions/testing.md` da raiz só com o que é desta unidade.

| Alvo      | Como                                                                                                        | Arquivo                  |
| --------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| Regras    | Casos de user-agent, cabeçalhos de origem, país e dispositivo                                               | `rules.test.ts`          |
| Fluxo     | Pageview gravado posição por posição; cada motivo de descarte com status e ponto `discard`                  | `pageview.test.ts`       |
| Manifesto | Lê uma vez; inválido lança e libera nova tentativa                                                          | `manifest-cache.test.ts` |
| Borda     | `env` falso + `Request` do Node com `cf`: status, `no-store`, 404/405, `X-Test-Country`, falha do manifesto | `index.test.ts`          |

- Em Node, sem o runtime da Cloudflare (ADR 0003). O runtime real se confere com `pnpm dev`:

  ```sh
  curl -X POST -H 'user-agent: Mozilla/5.0 (Windows NT 10.0) Chrome/140' \
    -H 'sec-fetch-site: same-origin' -H 'x-test-country: BR' \
    --data '{"formatVersion":1,"type":"pageview","eventId":"0b0f8a52-6b0e-4b8e-9d3a-2f1c5e7a9b10","page":{"articleId":1}}' \
    http://127.0.0.1:8787/_e/pageview
  ```

- Carga sintética e E2E com Playwright: use um user-agent de navegador comum; o `isbot`
  descarta `HeadlessChrome` (resposta `204`, ponto `discard` com motivo `bot`).

## Como rodar

- Nesta pasta: `pnpm test` · um arquivo: `pnpm vitest run src/pageview.test.ts`
- Da raiz: `pnpm turbo run test --filter=@orakel/blog-worker`
