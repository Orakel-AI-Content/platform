# 0012 – Envio e ingestão de imagens

- Status: aceito
- Data: 2026-10-06

## Contexto

A entrada (0001) pede a ingestão com sharp: largura máxima ~2.560 px, EXIF removido (sempre
com o GPS) e o original em `media-originals/<site>/`. Hoje as imagens dos sites de exemplo vêm
das fixtures; não há como enviar uma (workspace#18, platform#49). Server Actions do Next
limitam o corpo a 1 MB, e uma foto de câmera passa de 10 MB.

## Decisão

- **Envio:** `POST /sites/<site>/midia/envio`, na área autenticada, com o arquivo cru no
  corpo (sem multipart) e `Content-Length` obrigatório. O domínio (`domain/media/upload.ts`)
  confere, antes de gravar qualquer coisa: `content.write` (admin e editor), o limite de
  25 MB e a assinatura dos primeiros bytes (JPEG, PNG, WebP ou AVIF; o `Content-Type` e a
  extensão não contam). Recusas: 403, 411, 413, 415 e 404 (site inexistente).
- **Gravação em streaming:** o corpo vai direto para `media-originals/uploads/<site>/<uuid>.<ext>`
  (`PutObject` com o tamanho anunciado), sem passar inteiro pela memória do web; em seguida
  a task `ingest-media` é enfileirada (até 5 tentativas).
- **Ingestão no `backoffice-worker`** (`domain/media/ingest.ts`): `sharp` aplica a orientação
  do EXIF, limita a largura a 2.560 px sem ampliar e reencoda no mesmo formato, sem copiar
  metadados (EXIF, XMP, IPTC). O original vai para `media-originals/<site>/<sha256>.<ext>`
  (hash do arquivo normalizado) e o envio cru é apagado depois.
- **Fronteira:** o `sharp` só é importado pelo worker; a rota não o carrega. O armazenamento
  é a interface `ObjectStore` (S3 em `lib/s3.ts`, memória nos testes).

## Alternativas consideradas

- **Multipart com `request.formData()`:** bufferiza o arquivo inteiro na memória do web.
- **URL assinada para o navegador enviar direto ao S3:** descartada no refinamento
  (workspace#18); exigiria CORS no bucket e uma segunda chamada para confirmar o envio.
- **Converter tudo para um formato único:** as variantes por formato são do perfil de imagem
  (platform#50); o original fica no formato de entrada.

## Consequências

- Reenviar a mesma imagem cai no mesmo original (o nome é o hash).
- Um envio cuja ingestão falhou de vez fica em `uploads/`; a limpeza fica para depois.
- Registrar a mídia (`createMedia`) e gerar as variantes é o passo seguinte (platform#50).
