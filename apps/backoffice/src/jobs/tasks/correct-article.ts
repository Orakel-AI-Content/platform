import type { Issue, Result } from '@orakel/content-model';
import type { Task } from 'graphile-worker';
import * as z from 'zod';

import type { Db } from '../../db/client.ts';
import type { ContentEdit } from '../../domain/content/contents.ts';
import { correct } from '../../domain/generation/correct.ts';
import type { GenerationSettings } from '../../domain/generation/generate.ts';
import {
  finishRun,
  pendingCorrection,
  type CorrectArticlePayload,
  type GenerationCall,
  type PendingCorrection,
  type RunOutcome,
} from '../../domain/generation/runs.ts';

export type CorrectArticleTaskDeps = {
  db: Db;
  generation: GenerationSettings;
  /** Backoffice-web (`GENERATOR_API_URL`) e o token do gerador. */
  api: { url: string; token: string };
  fetch?: typeof fetch;
};

/** Tempo máximo da gravação da versão corrigida pela rota interna. */
const API_TIMEOUT_MS = 30_000;

function payloadOf(payload: unknown): CorrectArticlePayload {
  const { runId } = (payload ?? {}) as Partial<Record<keyof CorrectArticlePayload, unknown>>;
  if (!Number.isInteger(runId)) {
    throw new Error(`Payload da correção inválido: ${JSON.stringify(payload)}`);
  }
  return { runId: runId as number };
}

const issue = (code: string, message: string): Issue => ({ code, message, path: [] });

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const Created = z.object({ id: z.number().int(), version: z.number().int() });
const Problem = z.object({
  title: z.string().optional(),
  issues: z
    .array(z.object({ code: z.string(), message: z.string(), path: z.array(z.any()) }))
    .optional(),
});

/**
 * Grava a N+1 pela rota interna (`POST /api/internal/v1/contents/<id>/versions`), como o motor
 * definitivo fará: nunca pelo domínio de conteúdo direto. A guarda da versão-base é da rota
 * (409 se o editor já mexeu). A versão criada é sempre a seguinte à base, porque a rota só
 * grava sobre a mais recente; outra resposta é tratada como inválida. Recusa da rota e falha de
 * rede voltam como problemas da execução.
 */
async function postVersion(
  run: PendingCorrection,
  content: ContentEdit,
  deps: CorrectArticleTaskDeps,
): Promise<Result<{ id: number; version: number }>> {
  const doFetch = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(
      new URL(`/api/internal/v1/contents/${run.contentId}/versions`, deps.api.url),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${deps.api.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ siteId: run.siteId, baseVersion: run.baseVersion, content }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue('correction.api_unreachable', `Rota interna inacessível: ${messageOf(error)}`),
      ],
    };
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (response.status === 201) {
    const created = Created.safeParse(body);
    if (
      created.success &&
      created.data.id === run.contentId &&
      created.data.version === run.baseVersion + 1
    ) {
      return { ok: true, value: created.data };
    }
    return {
      ok: false,
      issues: [
        issue(
          'correction.api_invalid_response',
          `A rota interna não devolveu a versão ${run.baseVersion + 1} do conteúdo ${run.contentId}`,
        ),
      ],
    };
  }
  const problem = Problem.safeParse(body);
  const title = problem.success ? (problem.data.title ?? '') : '';
  return {
    ok: false,
    issues: [
      issue(
        'correction.api_refused',
        `A rota interna recusou a versão corrigida (${response.status})${title === '' ? '' : `: ${title}`}`,
      ),
      ...((problem.success ? problem.data.issues : undefined) ?? []),
    ],
  };
}

/** Uma chamada ao modelo e, com saída válida, a gravação da N+1; nunca lança. */
async function execute(
  run: PendingCorrection,
  deps: CorrectArticleTaskDeps,
): Promise<{ outcome: RunOutcome; version?: number }> {
  let result;
  try {
    result = await correct(run.input, deps.generation);
  } catch (error) {
    return {
      outcome: {
        call: null,
        status: 'falha',
        issues: [issue('correction.unexpected', `Falha na correção: ${messageOf(error)}`)],
      },
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
  if (!result.ok) return { outcome: { call, status: 'falha', issues: result.issues } };

  const created = await postVersion(run, result.content, deps);
  return created.ok
    ? {
        outcome: { call, status: 'ok', contentId: created.value.id },
        version: created.value.version,
      }
    : { outcome: { call, status: 'falha', issues: created.issues } };
}

/**
 * Correção automática pedida na devolução (workspace#95, ADR 0023): lê a execução `correcao`
 * `pendente`, chama o modelo uma vez e grava a versão corrigida, que entra na fila de revisão;
 * só uma decisão humana a tira de lá. Toda falha termina a execução em `falha`, sem lançar, e o
 * artigo continua devolvido com o comentário: o job tem `max_attempts => 1` e uma exceção só
 * deixaria a execução presa em `pendente`.
 */
export function createCorrectArticleTask(deps: CorrectArticleTaskDeps): Task {
  return async (payload, helpers) => {
    const { runId } = payloadOf(payload);
    const run = await pendingCorrection(deps.db, runId);
    if (run === undefined) {
      helpers.logger.warn(`correção ${runId} ignorada: a execução não existe ou já terminou`);
      return;
    }
    const { outcome, version } = await execute(run, deps);
    await finishRun(deps.db, runId, outcome);
    if (outcome.status === 'ok') {
      helpers.logger.info(
        `correção ${runId} de ${run.siteId}: conteúdo ${outcome.contentId}, versão ${String(version)}`,
      );
    } else {
      helpers.logger.warn(
        `correção ${runId} de ${run.siteId} falhou: ${outcome.issues.map((i) => i.code).join(', ')}`,
      );
    }
  };
}
