# 0003 – Versões, rollback e retenção

- Status: aceito
- Data: 2026-09-30

- **ID:** `<UTC compacto>-<8 hex do sha256 do tar.gz>`, sempre crescente na ordem de publicação (duas no mesmo segundo: a segunda ganha +1 s) — a ordem dos IDs é a que o rollback usa.
- **Disco:** `<data>/sites/<site>/versions/<id>/` com `site/`, `worker/index.js` e `wrangler.jsonc` sem escrita (a pasta da versão fica gravável para o `.wrangler/` do runtime); `<data>/sites/<site>/active` gravado por arquivo temporário + `rename`.
- **Arquivo aceito:** o `tar.gz` do publish (`ARCHIVE_LAYOUT` de `@orakel/build-contract`); `wrangler.jsonc` com `name: orakel-<site>`; senão 400. Versão que não sobe é apagada (400) e a ativa continua.
- **Troca sem queda:** sobe a nova, espera pronta, aponta o proxy, grava `active`, desliga a antiga. Uma operação por vez por site (409).
- **API:** `PUT …/versions` → 201 `{ id }`; `GET …/versions` → `{ active, versions: [{ id, createdAt, files, active }] }`; `POST …/rollback` com `{ id }` opcional (sem ID: a anterior à ativa, como o `wrangler rollback`) → `{ active }`, 404 se não houver.
- **Retenção:** 10 por site (`EDGE_LOCAL_KEEP`), nunca a ativa. **Reinício:** sobe as ativas; `/healthz` só fica 200 depois disso.
