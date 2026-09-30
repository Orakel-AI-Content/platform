#!/bin/sh
# Buckets do armazenamento local (ADR 0013 da raiz), os mesmos do R2 de produção. Rodado pelo
# serviço s3-init a cada local:up; bucket que já existe é mantido.
#   media-originals   originais das imagens (privado)
#   media-<site>      variantes de cada site (lidas pelo Caddy em media.<site>.localhost)
#   build-cache       saída compactada de cada publish
#   backups, brasil   backups do Postgres e a cópia fora da nuvem
set -eu

buckets="media-originals build-cache backups brasil"
for site in $(echo "${LOCAL_SITES:-}" | tr ',' ' '); do
  buckets="$buckets media-$site"
done

existing=$(echo "s3.bucket.list" | weed shell -master=s3:9333 -filer=s3:8888 2>/dev/null)
for bucket in $buckets; do
  if echo "$existing" | grep -qw "$bucket"; then
    echo "bucket $bucket: já existe"
  else
    echo "s3.bucket.create -name $bucket" | weed shell -master=s3:9333 -filer=s3:8888 >/dev/null
    echo "bucket $bucket: criado"
  fi
done
