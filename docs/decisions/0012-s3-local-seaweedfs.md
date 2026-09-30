# 0012 – S3 local com SeaweedFS

- Status: aceito
- Data: 2026-09-30

## Contexto

O 12.0 prevê MinIO no local; o ADR 0008 já trocou por SeaweedFS 4.48, porque o MinIO deixou
de publicar imagens da edição comunitária. Faltava o desenho: console, mídia pública, rede.

## Decisão

- Serviço `s3` (`weed server`): S3 em `:8333` (credenciais do `.env.local` numa `config` do
  compose), filer em `:8888`, master em `:9333`.
- `-ip=s3 -ip.bind=0.0.0.0`: o master anuncia o nome do serviço, que resolve em todas as redes
  do `s3` (`internal`, `publish`, `edge`). Com o IP de uma rede só, o `weed shell` de outra
  ficava esperando.
- Console: `weed admin` no serviço `s3-admin`, em `https://s3.orakel.localhost` (atrás do
  access-mock), no lugar do `minio.orakel.localhost` do 12.0.
- `-filer.disableDirListing`: o filer não lista diretórios (a mídia é pública só por caminho).

## Alternativas consideradas

- MinIO (sem imagens da edição comunitária), Garage e RustFS (ADR 0008).

## Consequências

- O hostname `minio.orakel.localhost` e o `infra/local/minio/init.sh` do 12.0 viram
  `s3.orakel.localhost` e `infra/local/s3/init.sh`.
