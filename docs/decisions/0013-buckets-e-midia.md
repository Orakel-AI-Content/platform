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
  `infra/local/seeds/sites.json` (até 2026-10-31, da variável `LOCAL_SITES`).
- Mídia sem leitura anônima no S3: o Caddy atende `media.<site>.localhost` (pelo formato do
  nome, no bloco genérico; até 2026-10-31, por uma lista em `LOCAL_MEDIA_HOSTS`, porque o
  curinga só cobre um nível), menos `media.originals.localhost`, e reescreve para
  `/buckets/media-<site>/<caminho>` no filer e acrescenta
  `Cache-Control: public, max-age=31536000, immutable`. Só `GET` e `HEAD`; o resto é 405.

## Alternativas consideradas

- Leitura anônima no S3 (identidade anônima por bucket): sem o filer no caminho, mas abre o S3
  para leitura e exige gerar a config de identidades por site.
- Um bucket de mídia só, com prefixo por site: menos buckets, mas diverge do R2 (um por site).

## Consequências

- Site novo no local: acrescente-o a `infra/local/seeds/sites.json` e rode `local:up`.

## Revisão (2026-10-31)

As duas listas do `.env.local` (`LOCAL_SITES` e `LOCAL_MEDIA_HOSTS`) ficaram para trás quando
o Horta em Casa entrou no seed: o bucket existia, mas o Caddy mandava
`media.horta-em-casa.localhost` ao edge-local, que responde 404, e o `local:check` aceitava o
404 como se viesse do filer. As imagens sumiram dos sites sem erro nenhum. Agora não há lista
para atualizar: os buckets vêm do `sites.json` (o mesmo arquivo dos domínios locais), o Caddy
reconhece o host pelo formato, o `local:check` confere o `Server` de quem respondeu, e o seed
grava de novo as imagens que faltam no bucket (as das fixtures, lisas) mesmo com o site já no
banco.
