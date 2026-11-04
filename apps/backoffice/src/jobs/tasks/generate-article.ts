import type { Issue, Result } from '@orakel/content-model';
import type { Task } from 'graphile-worker';
import * as z from 'zod';

import type { Db } from '../../db/client.ts';
import {
  generate,
  type GeneratedContent,
  type GenerationSettings,
} from '../../domain/generation/generate.ts';
import {
  finishRun,
  pendingRun,
  type GenerateArticlePayload,
  type GenerationCall,
  type PendingRun,
  type RunOutcome,
} from '../../domain/generation/runs.ts';

export type GenerateArticleTaskDeps = {
  db: Db;
  generation: GenerationSettings;
  /** Backoffice-web (`GENERATOR_API_URL`) e o token do gerador. */
  api: { url: string; token: string };
  fetch?: typeof fetch;
};

/** Tempo máximo da criação do artigo pela rota interna. */
const API_TIMEOUT_MS = 30_000;

function payloadOf(payload: unknown): GenerateArticlePayload {
  const { runId } = (payload ?? {}) as Partial<Record<keyof GenerateArticlePayload, unknown>>;
  if (!Number.isInteger(runId)) {
    throw new Error(`Payload da geração inválido: ${JSON.stringify(payload)}`);
  }
  return { runId: runId as number };
}

const issue = (code: string, message: string): Issue => ({ code, message, path: [] });

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const Created = z.object({ id: z.number().int() });
const Problem = z.object({
  title: z.string().optional(),
  issues: z
    .array(z.object({ code: z.string(), message: z.string(), path: z.array(z.any()) }))
    .optional(),
});

/**
 * Cria o artigo pela rota interna, como o motor definitivo fará (`POST
 * /api/internal/v1/contents`): nunca pelo domínio de conteúdo direto. Recusa da rota e
 * falha de rede voltam como problemas da execução.
 */
async function postContent(
  run: PendingRun,
  content: GeneratedContent,
  deps: GenerateArticleTaskDeps,
): Promise<Result<{ id: number }>> {
  const doFetch = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(new URL('/api/internal/v1/contents', deps.api.url), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.api.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ siteId: run.siteId, content }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue('generation.api_unreachable', `Rota interna inacessível: ${messageOf(error)}`),
      ],
    };
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 201) {
    const created = Created.safeParse(body);
    if (created.success) return { ok: true, value: { id: created.data.id } };
    return {
      ok: false,
      issues: [issue('generation.api_invalid_response', 'A rota interna não devolveu o id')],
    };
  }
  const problem = Problem.safeParse(body);
  const title = problem.success ? (problem.data.title ?? '') : '';
  return {
    ok: false,
    issues: [
      issue(
        'generation.api_refused',
        `A rota interna recusou o artigo (${response.status})${title === '' ? '' : `: ${title}`}`,
      ),
      ...((problem.success ? problem.data.issues : undefined) ?? []),
    ],
  };
}

/** Uma chamada ao modelo e, com saída válida, a criação do artigo; nunca lança. */
async function execute(run: PendingRun, deps: GenerateArticleTaskDeps): Promise<RunOutcome> {
  let result;
  try {
    result = await generate(run.input, deps.generation);
  } catch (error) {
    return {
      call: null,
      status: 'falha',
      issues: [issue('generation.unexpected', `Falha na geração: ${messageOf(error)}`)],
    };
  }
  const call: GenerationCall = {
    prompt: result.prompt,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  };
  if (!result.ok) return { call, status: 'falha', issues: result.issues };

  const created = await postContent(run, result.content, deps);
  return created.ok
    ? { call, status: 'ok', contentId: created.value.id }
    : { call, status: 'falha', issues: created.issues };
}

/**
 * Geração básica de um artigo (workspace#23, R4 e R5): lê a execução `pendente`, chama o
 * modelo uma vez e grava o desfecho. Toda falha da geração ou da rota interna termina a
 * execução em `falha`, com o erro, sem lançar: o job tem `max_attempts => 1` e uma exceção
 * só deixaria a execução presa em `pendente`.
 */
export function createGenerateArticleTask(deps: GenerateArticleTaskDeps): Task {
  return async (payload, helpers) => {
    const { runId } = payloadOf(payload);
    const run = await pendingRun(deps.db, runId);
    if (run === undefined) {
      helpers.logger.warn(`geração ${runId} ignorada: a execução não existe ou já terminou`);
      return;
    }
    const outcome = await execute(run, deps);
    await finishRun(deps.db, runId, outcome);
    if (outcome.status === 'ok') {
      helpers.logger.info(`geração ${runId} de ${run.siteId}: conteúdo ${outcome.contentId}`);
    } else {
      helpers.logger.warn(
        `geração ${runId} de ${run.siteId} falhou: ${outcome.issues.map((i) => i.code).join(', ')}`,
      );
    }
  };
}
