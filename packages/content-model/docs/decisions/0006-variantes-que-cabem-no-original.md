# 0006 – Variantes de imagem que cabem no original

- Status: aceito
- Data: 2026-10-06

## Contexto

A regra `supported-resources` exigia, de toda mídia, todas as larguras do perfil de imagem
(320 a 1920) em todos os formatos. A ingestão do Backoffice (platform#50) não amplia imagem:
um original de 800 px não tem como gerar 960, 1280 e 1920, e a mídia reprovaria o snapshot
inteiro, pausando o build do site.

## Decisão

- A mídia precisa ter, em cada formato do perfil, as larguras do perfil que sejam menores
  ou iguais a `media.width`. Se nenhuma couber (original menor que a menor largura), precisa
  de uma variante por formato com a largura do próprio original.
- O conjunto sai de `requiredImageWidths(mediaWidth, resources)`, usado pela regra e por
  quem gera as variantes. `validateMedia` aplica a regra a uma mídia isolada.
- Continua na v1: nenhum schema muda e a regra só passa a aceitar mais mídias.

## Alternativas consideradas

- Gerar `-960`, `-1280` e `-1920` com a largura real menor: mantém a regra, mas o `srcset`
  declararia larguras que o arquivo não tem e haveria arquivos duplicados.
- Versão nova do contrato: nada na forma dos dados muda; seria custo sem ganho.

## Consequências

- Uma release do `site-builder` anterior a esta regra reprova mídia pequena até ser
  promovida.
- Quem renderiza não pode supor uma largura mínima no `srcset` (o `Image.astro` escolhe o
  fallback entre as variantes que existem).
