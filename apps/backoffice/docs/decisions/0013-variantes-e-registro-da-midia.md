# 0013 – Variantes e registro da mídia

- Status: aceito
- Data: 2026-10-06

## Contexto

Depois da ingestão (0012), o original normalizado está em `media-originals/<site>/<sha256>.<ext>`.
O site serve as variantes do perfil de imagem (`RESOURCES.imageProfile`) por `media.<domínio>`,
a partir do bucket `media-<site>` (ADR 0013 da raiz), e o snapshot precisa da mídia registrada
com as variantes (platform#50).

## Decisão

- **Job próprio, encadeado:** ao terminar, `ingest-media` enfileira `media-variants` com
  `{ siteId, originalKey, width, height }` (`helpers.addJob`, até 5 tentativas). Uma falha no
  registro repete só as variantes, sem refazer a normalização.
- **Quais variantes:** as larguras de `requiredImageWidths` do `content-model` (as do perfil
  que cabem no original; ADR 0006 do content-model) × os formatos do perfil, sem ampliar.
- **Nome imutável:** `<site>/<hash-do-original>-<largura>.<formato>` em `media-<site>`, o
  mesmo `path` das fixtures. Variante que já existe (`exists`, um `HEAD`) não é regravada:
  reenviar a mesma imagem não toca no que está publicado. Não usamos `If-None-Match` no
  `PutObject` porque o suporte varia entre SeaweedFS e R2.
- **Registro:** `createMedia` com o `SYSTEM_ACTOR`, numa transação (registra a mudança
  pendente e agenda o build). `createMedia` recusa variantes que não cobrem o perfil exigido.

## Alternativas consideradas

- Gerar as variantes dentro de `ingest-media`: um job só, mais longo, e a falha no registro
  repetiria a normalização.
- Gerar as larguras maiores que o original com a largura real: o `srcset` mentiria a largura.

## Consequências

- Reenviar a mesma imagem cria um segundo registro de mídia com as mesmas variantes; a
  deduplicação de registros fica para depois.
- O reprocessamento (platform#51) reaproveita `generateVariants`, que já gera só o que falta.
