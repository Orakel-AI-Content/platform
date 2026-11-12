// REST API do GitHub por HTTP (fetch), só no build-runner, o único processo com o PAT (ADR 0022
// da raiz). Sem cliente pronto: são duas chamadas — disparar um workflow e ler um run —, no
// mesmo molde do lib/docker.ts. O token só vai no cabeçalho; nenhuma mensagem de erro o repete.

type Options = {
  /** PAT fine-grained (GITHUB_TOKEN). */
  token: string;
  /** `dono/nome` (GITHUB_REPOSITORY). */
  repository: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

/**
 * Falha de uma chamada ao GitHub. `transient`: rede, 5xx ou limite de requisições (vale repetir);
 * senão, a mensagem é legível para a operação e repetir não muda nada.
 */
export class GitHubError extends Error {
  override readonly name = 'GitHubError';
  readonly transient: boolean;
  readonly status: number | undefined;

  constructor(
    message: string,
    options: { transient: boolean; status?: number | undefined; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.transient = options.transient;
    this.status = options.status;
  }
}

/** Run disparado: o id passa de 32 bits e não entra em conta (texto). */
export type DispatchedRun = { runId: string; runUrl: string };

/** `status` e `conclusion` como o GitHub os devolve; `conclusion` só existe com `completed`. */
export type WorkflowRun = { status: string; conclusion: string | null; runUrl: string };

export interface GitHubClient {
  /** Dispara o workflow na `ref` com os inputs e devolve o run criado. */
  dispatchWorkflow(
    workflow: string,
    ref: string,
    inputs: Record<string, string>,
  ): Promise<DispatchedRun>;
  getRun(runId: string): Promise<WorkflowRun>;
}

const RUN_ID = /^[0-9]+$/;

/** Mensagem do corpo de erro do GitHub (`{ message }`), se houver. */
async function messageOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const message = (JSON.parse(text) as { message?: unknown }).message;
    return typeof message === 'string' ? message : text;
  } catch {
    return text;
  }
}

function rateLimited(response: Response): boolean {
  return (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.has('retry-after')))
  );
}

export function githubClient(options: Options): GitHubClient {
  const base = (options.baseUrl ?? 'https://api.github.com').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const repo = options.repository;

  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const what = `${method} ${path}`;
    let response: Response;
    try {
      response = await doFetch(`${base}/repos/${repo}${path}`, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${options.token}`,
          'user-agent': 'orakel-build-runner',
          'x-github-api-version': '2022-11-28',
          ...(body !== undefined && { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new GitHubError(`GitHub indisponível (${what}): ${String(error)}`, {
        transient: true,
        cause: error,
      });
    }
    if (response.ok) return response;

    const status = response.status;
    const detail = await messageOf(response);
    if (status >= 500 || rateLimited(response)) {
      throw new GitHubError(`GitHub respondeu ${status} (${what}): ${detail}`, {
        transient: true,
        status,
      });
    }
    const message =
      status === 401
        ? 'O GitHub recusou a credencial: o GITHUB_TOKEN está inválido ou expirou'
        : status === 403
          ? `A credencial do GitHub não tem permissão: precisa de actions:write e contents:read em ${repo}`
          : status === 404
            ? `O GitHub não encontrou o workflow ou o repositório ${repo} (ou a credencial não o enxerga)`
            : status === 422
              ? `O GitHub recusou o pedido: ${detail}`
              : `GitHub respondeu ${status} (${what}): ${detail}`;
    throw new GitHubError(message, { transient: false, status });
  }

  function invalid(what: string, body: unknown): GitHubError {
    return new GitHubError(`Resposta inesperada do GitHub (${what}): ${JSON.stringify(body)}`, {
      transient: false,
    });
  }

  return {
    async dispatchWorkflow(workflow, ref, inputs) {
      // `return_run_details`: a resposta traz o id do run, sem procurar o run na lista.
      const response = await call('POST', `/actions/workflows/${workflow}/dispatches`, {
        ref,
        inputs,
        return_run_details: true,
      });
      const body = (await response.json().catch(() => null)) as {
        workflow_run_id?: unknown;
        html_url?: unknown;
      } | null;
      const id = body?.workflow_run_id;
      const runId = typeof id === 'number' || typeof id === 'string' ? String(id) : '';
      if (!RUN_ID.test(runId) || typeof body?.html_url !== 'string') {
        throw invalid('dispatches', body);
      }
      return { runId, runUrl: body.html_url };
    },

    async getRun(runId) {
      if (!RUN_ID.test(runId)) throw new Error(`id de run inválido: ${runId}`);
      const response = await call('GET', `/actions/runs/${runId}`);
      const body = (await response.json().catch(() => null)) as {
        status?: unknown;
        conclusion?: unknown;
        html_url?: unknown;
      } | null;
      if (typeof body?.status !== 'string' || typeof body.html_url !== 'string') {
        throw invalid('runs', body);
      }
      return {
        status: body.status,
        conclusion: typeof body.conclusion === 'string' ? body.conclusion : null,
        runUrl: body.html_url,
      };
    },
  };
}
