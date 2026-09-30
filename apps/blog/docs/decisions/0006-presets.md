# 0006 – Presets padrao e revista

- Status: aceito
- Data: 2026-09-30

## Decisão

| Página                | `padrao` (exemplo-a, editorial)                          | `revista` (exemplo-b)                                       |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Home                  | Lista em coluna única, cards na variante do site         | Destaque do mais recente, carrossel (≥ 3 seguintes) e grade |
| Artigo                | Coluna de ~68ch, capa abaixo do título, sumário no fluxo | Capa larga acima do título, sumário lateral ≥ 64rem         |
| Categoria, tag, série | Cabeçalho simples e lista                                | Faixa com a cor de destaque e grade                         |
| Autor                 | Perfil e lista                                           | Faixa e grade                                               |

- `revista` entrou nos `RESOURCES.presets` do content-model (mudança aditiva da v1) e na fixture `exemplo-b`.
- `views/PageView.astro` escolhe o componente; nome desconhecido é falha permanente.
- Variantes do card: `vertical` e `horizontal` (`variants.articleCard`).

## Consequências

Preset novo: componentes em `src/presets/<tipo>/`, nome em `PRESET_NAMES` e em `RESOURCES.presets`, no mesmo PR.
