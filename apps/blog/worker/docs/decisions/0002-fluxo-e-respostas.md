# 0002 – Borda fina, fluxo com dependências injetadas e respostas sem detalhe

- Status: aceito
- Data: 2026-09-29

## Contexto

Uma rota só, mas com uma sequência de regras (bot, origem, corpo, manifesto, sessão,
gravação). A raiz pede que as bordas traduzam erros para status adequados sem vazar
detalhes, e a entrada diz que falha na rota perde o evento, nunca a página.

## Decisão

- `src/index.ts` só lê `env` e `request`, chama o fluxo e devolve a `Response`.
- `src/pageview.ts` é o fluxo, sem `Request` nem `env`: recebe os dados extraídos e as
  dependências (`getManifest`, `write`, `uuid`) e devolve `{ status, body? }`.
- Uma regra por módulo, pura: `bot.ts` (`isbot`), `origin.ts`, `country.ts`, `device.ts`.
- Ordem: bot → origem → `Content-Length` → `parseEventBody` → manifesto → sessão →
  ponto. Nada é lido do corpo antes de bot e origem passarem.
- Respostas: `200 { sid? }`; descartes sem corpo — bot `204` (nada a sinalizar ao
  bot), origin `403`, size `413`, schema `400`, manifest `422`; `404` fora de
  `/_e/pageview`, `405` fora de `POST`; sempre `cache-control: no-store`.
- Exceção inesperada (ex.: manifesto ilegível) é registrada nos Workers Logs e responde
  `204`.
- `writeDataPoint` sem `await`: a gravação não atrasa a resposta.

## Alternativas consideradas

- Handler único: testes precisariam simular `Request`, `env` e `cf` em todo caso.
- Hono ou outro roteador: dependência sem ganho para uma rota.

## Consequências

Quase todo o comportamento é testável sem o runtime da Cloudflare (ADR 0003).
