# 0013 – Buckets e mídia local

- Status: aceito
- Data: 2026-09-30

## Contexto

O 11.6 pede os mesmos buckets do R2 e a mídia pública em `media.<site>.localhost`, com
`Cache-Control` imutável.

## Decisão

- Buckets criados pelo serviço one-shot `s3-init` (`infra/local/s3/init.sh`, `weed shell`
  `s3.bucket.create`) a cada `local:up`; bucket que já existe é mantido:
  `media-originals`, `build-cache`, `backups`, `brasil` e `media-<site>` para cada site de
  `LOCAL_SITES`.
- Mídia sem leitura anônima no S3: o Caddy atende `media.<site>.localhost` (lista em
  `LOCAL_MEDIA_HOSTS`, porque o curinga só cobre um nível), reescreve para
  `/buckets/media-<site>/<caminho>` no filer e acrescenta
  `Cache-Control: public, max-age=31536000, immutable`. Só `GET` e `HEAD`; o resto é 405.

## Alternativas consideradas

- Leitura anônima no S3 (identidade anônima por bucket): sem o filer no caminho, mas abre o S3
  para leitura e exige gerar a config de identidades por site.
- Um bucket de mídia só, com prefixo por site: menos buckets, mas diverge do R2 (um por site).

## Consequências

- Site novo no local: acrescente-o a `LOCAL_SITES` e `LOCAL_MEDIA_HOSTS` e rode `local:up`.
