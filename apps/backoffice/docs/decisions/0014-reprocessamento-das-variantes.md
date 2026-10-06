# 0014 – Reprocessamento das variantes

- Status: aceito
- Data: 2026-10-06

## Contexto

Quando o perfil de imagem muda (largura ou formato novo), as mídias já registradas precisam
das variantes que faltam, geradas a partir do original, sem refazer as que existem. O mesmo
job entra na promoção de release (12.0, L6, passo 1; workspace#26). A mídia não guardava onde
estava o original (0013).

## Decisão

- **Original:** coluna `media.original_key` (migração aditiva), gravada pelo job
  `media-variants`. É só operacional: `toMedia` não a exporta e o contrato v1 não muda.
  Mídias importadas (fixtures) ficam com nulo.
- **Diferença:** para cada mídia, as variantes exigidas pelo perfil (`requiredImageWidths` ×
  formatos, a mesma regra do content-model) menos as registradas em `media_variants`. Mídia
  sem diferença é pulada sem ler o original; com diferença, gera só as que faltam (e não
  regrava o que já existe no bucket) e as acrescenta com a mudança pendente do site.
- **Mídia sem original:** registrada no log (`warn`) e o job segue para a próxima.
- **Disparo:** `pnpm media:reprocess [site]` enfileira `media-reprocess` por site (todos sem
  argumento), com `job_key` `media-reprocess:<site>`: pedir de novo enquanto o job espera na
  fila não cria outro.

## Alternativas consideradas

- Achar o original pelo `path` das variantes (hash) testando extensões: depende da convenção
  de nome e não distingue o formato do original.
- Regenerar todas as variantes: contraria "só o que falta" e regravaria nomes imutáveis.

## Consequências

- O reprocessamento não apaga variantes que saíram do perfil nem amplia originais pequenos.
- Mídias anteriores a esta coluna, sem original conhecido, só aparecem no log.
