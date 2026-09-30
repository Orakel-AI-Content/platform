# 0001 – Entrada do scaffold do Worker de borda

- Status: aceito
- Data: 2026-09-29

## Contexto

A unidade foi gerada pela skill `/scaffold` (modo `unit`) a partir do bloco de scaffold do
Worker de borda, seção 11.3 de `docs/platform-requirements/12.0-fase-0-ambiente-local.md`
(`Orakel-AI-Content/workspace`, hash no `project-spec.yaml`). O scaffold foi pausado para
gerar antes o `@orakel/events`, do qual o Worker depende.

## Decisão

Texto da entrada, sem edição:

> | Tópico                  | Definido                                                                                                                                                                                                                                                                                                                                                                                                                                    |
> | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Tipo                    | Worker da Cloudflare com Static Assets. Código só em `/_e/*` (`run_worker_first = ["/_e/*"]`); o resto é estático, com `html_handling` para URLs limpas e `not_found_handling = "404-page"`                                                                                                                                                                                                                                                 |
> | Escopo na fase          | Só pageviews                                                                                                                                                                                                                                                                                                                                                                                                                                |
> | Comunicação             | Recebe eventos do script próprio dos sites (pageview por `fetch`); grava na borda e não chama nenhum servidor. Falha na rota perde o evento, nunca a página                                                                                                                                                                                                                                                                                 |
> | Validação               | Descarta user-agents de bots conhecidos; exige `Sec-Fetch-Site: same-origin` ou `Origin` do domínio do site; valida schema e tamanho do corpo pelo `packages/events`; confere o artigo no manifesto de eventos gerado no build (lido pelo binding de assets e mantido em memória); o site vem de `SITE_ID`, variável do Worker, nunca do payload; o horário é o do Worker                                                                   |
> | Privacidade             | Nunca lê nem grava o IP; país de `request.cf.country`. Sessão por ID aleatório emitido pelo Worker e devolvido na resposta do pageview; no EEE, Reino Unido e Suíça, nenhum ID nesta fase                                                                                                                                                                                                                                                   |
> | Dados                   | Binding `EVENTS` do Workers Analytics Engine, dataset `events`, `index1` = site. Layout posicional v1 (_proposta_): `blob1` versão do formato, `blob2` tipo, `blob3` caminho, `blob4` ID do artigo, `blob5` país, `blob6` classe de dispositivo, `blob7` host do referrer, `blob8` `sid`, `double1` = 1. Payload do pageview: versão do formato, `event_id` (UUID), página (ID do artigo, ou tipo e caminho), referrer, `sid` quando houver |
> | Configuração e segredos | `wrangler.jsonc` gerado no build por alvo (`local` e `cloudflare`), por convenção de nomes (dataset `events`, domínio do cadastro). No alvo local: service binding para o Worker `ae-sim` (mesma interface `writeDataPoint`, grava no ClickHouse) e `ALLOW_COUNTRY_OVERRIDE`, que aceita o cabeçalho de teste `X-Test-Country`. O alvo `cloudflare` nunca tem nenhum dos dois                                                               |
> | Script do navegador     | 1 a 2 kB, dentro do orçamento de JS do site; pageview no carregamento e no `pageshow` (bfcache); `sid` e horário da última atividade no `sessionStorage`, renovados após 30 min sem atividade                                                                                                                                                                                                                                               |
> | Deploy                  | Publicado junto com o site, pela etapa `publish` da imagem de build: `wrangler deploy` na Cloudflare; no ambiente local, a API de administração do `edge-local`                                                                                                                                                                                                                                                                             |
> | Observabilidade         | Eventos descartados são contados; exceções do Worker nos Workers Logs, com amostragem                                                                                                                                                                                                                                                                                                                                                       |

## Alternativas consideradas

Gerar o Worker antes do `@orakel/events`, com o formato dentro dele: o agregador não
poderia importá-lo.

## Consequências

Payload, layout, manifesto, sessão, script do navegador e contagem de descartes moram
no `@orakel/events` (ADRs 0002 a 0005 daquela unidade). O service binding do `ae-sim` e a
geração do `wrangler.jsonc` por alvo são do `build-site` e do ambiente local.
