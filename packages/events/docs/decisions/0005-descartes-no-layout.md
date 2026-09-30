# 0005 – Eventos descartados viram pontos no Analytics Engine

- Status: aceito
- Data: 2026-09-29

## Contexto

O bloco do Worker diz que "eventos descartados são contados", e a raiz prevê o alerta de
"descartados acima do normal", que o agregador precisa calcular.

## Decisão

- Cada requisição descartada grava um ponto com `blob2 = 'discard'` e o motivo em
  `blob9` (posição nova, aditiva ao layout v1): `bot`, `origin`, `size`, `schema` ou
  `manifest`.
- O ponto não leva caminho, referrer nem `sid`; o país fica, para separar ataque de
  configuração errada.
- `parseEventBody` devolve os códigos `size`, `json` e `schema.*`, que o Worker traduz
  para o motivo (`json` e `schema.*` viram `schema`).

## Alternativas consideradas

- Só nos Workers Logs: o agregador não consulta logs, e o alerta não teria origem.
- Contador agregado em Durable Object ou KV: estado na borda, que a arquitetura evita.

## Consequências

Mais pontos no Analytics Engine sob abuso; o rate limiting de `/_e/*` na zona limita
rajadas antes do Worker, e bots raramente executam o script.
