# 0019 – Execução da geração básica

- Status: aceito
- Data: 2026-11-03

## Contexto

A geração básica (workspace#23) registra cada execução (RN-CON-10, R5): tema, autor, versão
do contexto editorial, prompt, provedor, modelo, tokens, custo, duração, status e erro.
Saída inválida é falha, sem nova chamada ao modelo (R4). O artigo gerado entra na fila de
revisão pela rota interna do gerador (#539), que é o contrato que o motor definitivo
(`apps/generator`, fase 2) vai usar. O núcleo (`generate`, ADR 0018) não lê banco nem
ambiente.

## Decisão

- **Registro:** tabela `generation_runs`, operacional (fora do snapshot), com FK para a
  versão de `editorial_contexts` usada. Status `pendente` → `ok` | `falha`; prompt, uso,
  custo e duração ficam nulos enquanto `pendente`. Guarda o autor do artigo (`author_id`) e
  quem disparou (`created_by`).
- **Disparo:** `enqueueGeneration` (`src/domain/generation/runs.ts`) exige `content.write`,
  autor do site e contexto editorial, e grava a execução e o job `generate-article`
  (`max_attempts => 1`) na mesma transação, como a publicação agendada.
- **Task:** `generate-article` roda no `backoffice-worker`, lê os insumos da execução
  `pendente`, chama `generate` uma vez e cria o artigo por HTTP em
  `POST /api/internal/v1/contents`, com o `GENERATOR_TOKEN`. Nunca chama o domínio de
  conteúdo direto. O worker chega ao backoffice-web por `GENERATOR_API_URL` (padrão
  `http://backoffice-web:3000`, rede `internal`).
- **Falha:** toda falha (saída inválida, recusa da rota, rede, erro do provedor) termina a
  execução em `falha`, com os problemas em `error`, e a task retorna sem lançar. Execução
  que já terminou é ignorada.

## Alternativas consideradas

- **Chamar `createForReview` direto na task:** mais simples, mas deixaria o contrato motor
  → Backoffice sem uso até a fase 2.
- **Deixar a exceção marcar o job como falho:** com uma tentativa só, a execução ficaria
  `pendente` para sempre e o erro só no Graphile Worker, fora da tela.
- **Estado `executando`:** sem retentativa, não distingue nada que a tela precise mostrar.
- **Reaproveitar `EXPORT_API_URL`:** é a API de exportação vista pelos sites, em outra rede.

## Consequências

- Uma queda do worker no meio da chamada deixa a execução `pendente` (o job não volta, por
  `max_attempts => 1`); a tela de acompanhamento (#541) mostra o caso como está.
- O motor da fase 2 troca a task, não a rota nem a tabela.
