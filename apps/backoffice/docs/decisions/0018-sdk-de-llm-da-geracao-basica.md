# 0018 – SDK de LLM da geração básica

- Status: aceito
- Data: 2026-11-03

## Contexto

A geração básica (workspace#23) cria artigos de teste com uma única chamada ao LLM, com
saída estruturada derivada do Zod dos blocos do content-model (R3), e precisa de um modo sem
LLM para os testes (R7). Cada execução registra prompt, provedor, modelo, tokens, custo e
duração (R5); saída inválida é falha, sem nova tentativa (R4). O spec da unidade deixava em
aberto "SDK do LLM da geração básica (provedor e modelo configuráveis)". O refinamento
decidiu pelo Vercel AI SDK com o Claude Haiku.

## Decisão

- **SDK:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), no catalog da raiz. O núcleo fica em
  `src/domain/generation/` (`generate.ts`, `pricing.ts`, `fixture.ts`) e não lê o banco nem
  o ambiente: recebe recursos da release, contexto editorial, tema, autor, modelo resolvido e
  tabela de preços.
- **Chamada:** `generateObject` com o schema do artigo (título, slug, descrição e blocos).
  Os blocos são os schemas por tipo do content-model, sem `n`, limitados aos tipos de
  `resourcesFor(site).blockTypes`; `image` fica fora (exige mídia já cadastrada). O núcleo
  numera os blocos e completa autor, tipo e data; o resultado passa por `ContentSchema` e
  `validateContent` com os recursos da release.
- **Sem retentativa:** `maxRetries: 0` também desliga as retentativas internas do SDK (R4).
  Saída fora do schema (`NoObjectGeneratedError`), reprovada na validação ou recusa do
  provedor (`APICallError`) volta como falha com os mesmos dados de execução.
- **Modelo:** `LLM_MODEL` no formato `provedor:modelo`, padrão `anthropic:claude-haiku-5-5`.
  Só `anthropic:*` e `fixture` são aceitos. A chave fica em `LLM_API_KEY`, só no
  `.env.local` e lida por `src/env.ts`, passada explicitamente ao provedor (sem cair no
  `ANTHROPIC_API_KEY` do processo). Fora de `fixture`, a chave é obrigatória no boot.
- **Modo `fixture`:** `LLM_MODEL=fixture` usa o `MockLanguageModelV4` de `ai/test`, que
  responde sem rede a partir do tema do prompt, com tokens fixos. O tema
  `fixture-saida-invalida` devolve um artigo sem blocos, para exercitar a falha. É o padrão
  do `.env.example` e do CI.
- **Custo:** `LLM_PRICING`, um JSON por modelo (chave igual a `LLM_MODEL`) com o preço em
  dólares por milhão de tokens de entrada e de saída. Modelo fora da tabela fica com custo
  nulo, não erro. O `.env.example` traz o Haiku 5.5 (US$ 0,10 e 0,50).
- **Limite de gasto** (RN-GEN-07): configurado no painel do provedor, fora do código.

## Alternativas consideradas

- **SDK oficial da Anthropic atrás de uma interface própria** (adaptadores `anthropic` e
  `fixture`): menos uma camada, mas o mock, a saída estruturada a partir do Zod e a troca de
  provedor teriam de ser escritos aqui. O refinamento escolheu o Vercel AI SDK.
- **`generateText` com `output: Output.object(...)`:** é o sucessor indicado pelo AI SDK 7,
  que marca `generateObject` como deprecated (o SDK avisa em tempo de execução). Fica
  `generateObject`, a direção da Task; a troca é local a `generate.ts` e não muda o
  resultado.
- **Tabela de preços no código:** o preço do provedor muda sem release; por isso no
  ambiente.
- **Pedir o `n` dos blocos ao modelo:** abriria falha por `n` repetido
  (`checkUniqueBlockN`) sem ganho; o núcleo numera.

## Consequências

- Um `.env.local` anterior a esta decisão precisa de `LLM_MODEL=fixture` ou de
  `LLM_API_KEY`; sem eles, o boot do Backoffice falha listando `LLM_API_KEY`.
- A task `generate-article` (#542) chama `generate` com `resolveModel(LLM_MODEL,
LLM_API_KEY)` e `LLM_PRICING`, e grava o resultado em `generation_runs`.
- Outro provedor é um caso novo em `resolveModel` e um pacote `@ai-sdk/*` no catalog.
