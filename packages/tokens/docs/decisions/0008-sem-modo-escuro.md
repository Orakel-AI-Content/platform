# 0008 – Um esquema de cores por tema; sem modo escuro por preferência

- Status: aceito
- Data: 2026-09-29

## Decisão

Cada tema declara `colorScheme` (`light` ou `dark`), que vira `color-scheme` no `:root`. Um tema pode ser escuro por identidade (`exemplo-b`), mas não troca com `prefers-color-scheme`.

## Motivo

Modo escuro dobraria os pares de contraste e as execuções do axe, pediria imagens e logos com versão escura e testes das duas aparências em cada preset — nada disso está nos critérios da fase 0.

## Consequências

Adicionar depois é aditivo: bloco opcional `modes.dark` no tema, gerado dentro de `@media (prefers-color-scheme: dark)`, com o contraste verificado por modo. Temas existentes continuam válidos.
