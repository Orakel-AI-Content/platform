# Design de código do edge-local

- `Store` (disco) não conhece o runtime; `Supervisor` junta `Store` e `Runtime`; `admin.ts` e `proxy.ts` só falam com o `Supervisor`. O runtime real (`wranglerRuntime`) entra no `server.ts`; os testes de unidade usam um runtime falso.
- Erros esperados são `StoreError` com status HTTP (400, 404, 409); o resto vira 500 com log.
- Troca sempre na ordem: sobe a nova → aponta → grava `active` → desliga a antiga. Nunca derrube a ativa antes.
- Logs em JSON por linha.

Anti-padrões: servir o código-fonte do Worker em vez do bundle do arquivo; escrever dentro de `site/`, `worker/` ou `wrangler.jsonc` de uma versão; usar o `fetch` do Node para testar o proxy (ele ignora o `Host`).
