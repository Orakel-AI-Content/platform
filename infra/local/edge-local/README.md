# @orakel/edge-local

Substituto local do deploy na Cloudflare: recebe o `tar.gz` do `publish` do site-builder,
guarda versões imutáveis e serve cada site em `https://<site>.localhost` (pelo Caddy), com troca
sem queda e rollback. Inclui o `ae-sim`, que grava os pontos do Analytics Engine no ClickHouse
(no compose) ou em NDJSON (na máquina).

```sh
pnpm dev    # na máquina: sites :8080 (Host <site>.localhost), administração :8081, dados em /tmp/edge-local
curl -X PUT --data-binary @build.tar.gz localhost:8081/sites/exemplo-a/versions   # → { "id": … }
curl -H 'Host: exemplo-a.localhost' localhost:8080/
curl localhost:8081/sites/exemplo-a/versions
curl -X POST localhost:8081/sites/exemplo-a/rollback
```

No compose local, sobe com `pnpm local:up` (imagem do `pnpm local:images`), nas redes
`orakel-publish` (administração) e `orakel-edge` (sites, pelo Caddy); `pnpm local:publish <site>`
publica e `pnpm local:load` gera pageviews. Com `EDGE_LOCAL_CLICKHOUSE_URL`, o `ae-sim` grava
no ClickHouse; sem ela (`pnpm dev`), em NDJSON. Só para desenvolvimento. Documentação: `docs/README.md`.
