# 0001 – Entrada do scaffold do tokens

- Status: aceito
- Data: 2026-09-29

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir de `docs/platform-requirements/12.0-fase-0-ambiente-local.md` e `10-politicas-e-conformidade.md` (`Orakel-AI-Content/workspace`, hashes no spec).

## Decisão

**Linha `packages/tokens` (11.1):**

> Um JSON por tema → variáveis CSS (cores, tipografia, espaçamento, raios, sombras). Os pares de cor passam pela fórmula de contraste da WCAG; abaixo de AA, o build do pacote falha

**L1, "Temas e composição":** "`packages/tokens`: um JSON por tema → variáveis CSS. Os pares de cor declarados (texto/fundo, links, foco) passam pela fórmula de contraste da WCAG; abaixo de AA, o build do pacote falha (P14)." e "Dois temas com identidades distintas (P2)".

**Bloco do blog:** estilização por `<style>` com escopo + variáveis de `packages/tokens`; "um tema por site; trocar o tema é trocar as variáveis CSS"; "fontes auto-hospedadas, com subset e `preload` da fonte do texto"; "WCAG 2.2 AA: contraste verificado nos tokens".

**P14:** "Contraste verificado na geração dos tokens: um tema que não atinge o contraste mínimo quebra o build do `packages/tokens`."

**Da raiz e do `content-model`:** o tokens tem build próprio; o modo escuro é decidido aqui; `theme` da configuração do site é o "ID do tema em `@orakel/tokens`".

## Consequências

Formato, entrega, contraste, nomes, fontes e modo escuro foram decididos nesta unidade (ADRs 0002–0008).
