#!/usr/bin/env sh
# pnpm local:publish <site> (ADR 0026 da raiz, que revisa a 0015): pede o build ao Backoffice,
# pela mesma fila do "Publicar agora", e espera o resultado. Quem roda render e publish é o
# build-runner; o build fica no histórico do site e atualiza a versão ativa. Sai com código
# diferente de zero e o motivo gravado no build quando ele falha. Depois: https://<site>.localhost
set -eu
cd "$(dirname "$0")/../.."

site="${1:?uso: pnpm local:publish <site>}"
exec pnpm --silent --filter @orakel/backoffice site:publish "$site"
