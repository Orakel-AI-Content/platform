# 0001 – Entrada do scaffold do events

- Status: aceito
- Data: 2026-09-29

## Contexto

A unidade foi gerada pela skill `/scaffold` (modo `unit`) a partir de três trechos do
arquivo `docs/platform-requirements/12.0-fase-0-ambiente-local.md` do repositório
`Orakel-AI-Content/workspace` (hash no `project-spec.yaml`). O scaffold do Worker de borda
foi pausado para este pacote vir antes, porque o Worker e o agregador dependem dele.

## Decisão

**Linha `packages/events` do bloco do monorepo (seção 11.1):**

> Formato versionado dos eventos: payload, layout posicional do Analytics Engine e
> mensagem de fila; usado pelo Worker de borda e pelo agregador

**Etapa L6 (seção 6), eventos e agregador:**

> - payload do pageview: versão do formato, `event_id` (UUID), página (ID do artigo ou
>   tipo e caminho), referrer, `sid` quando houver;
> - o Worker: descarta user-agents de bots; exige `Sec-Fetch-Site: same-origin` ou
>   `Origin` do domínio; valida o schema e o tamanho do corpo; confere o artigo no
>   manifesto; usa `SITE_ID` da variável do Worker e o horário do próprio Worker; decide a
>   sessão pela região (`cf.country`; no EEE, Reino Unido e Suíça, sem ID nesta fase);
>   **nunca lê o IP**;
> - layout posicional v1 (_proposta_, a fixar no `packages/events`): `index1` = site;
>   `blob1` = versão do formato; `blob2` = tipo; `blob3` = caminho; `blob4` = ID do
>   artigo; `blob5` = país; `blob6` = classe de dispositivo; `blob7` = origem (host do
>   referrer); `blob8` = `sid`; `double1` = 1;
> - script de eventos com 1 a 2 kB: pageview no carregamento e no `pageshow` do bfcache;
>   `sid` e última atividade no `sessionStorage`, renovados após 30 min.
>
> **Agregador:** job horário que consulta o Analytics Engine (simulado) por SQL e grava
> tabelas diárias por site e por artigo no dia de America/Sao_Paulo, contando com
> `_sample_interval`.

**Bloco do Worker de borda (seção 11.3), linhas usadas:** "Validação" (manifesto de
eventos gerado no build, lido pelo binding de assets), "Privacidade" (sem IP; país de
`request.cf.country`; sessão por ID aleatório; nenhum ID no EEE, Reino Unido e Suíça),
"Dados" (layout acima) e "Script do navegador" (1 a 2 kB, `pageshow`, renovação após 30
min). "Observabilidade": "Eventos descartados são contados".

## Alternativas consideradas

Gerar o Worker primeiro, com o formato dentro dele: o agregador não poderia importá-lo
(app não importa app).

## Consequências

A mensagem da fila (cliques de afiliado) fica para a fase 3. As demais linhas do bloco do
Worker (bindings, `wrangler.jsonc`, deploy, lista de bots, dispositivo) são do Worker.
