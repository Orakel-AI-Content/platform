import { describe, expect, it } from 'vitest';

import { GitHubError, githubClient } from './github.ts';

type Call = { method: string; url: string; headers: Record<string, string>; body?: unknown };

/** fetch falso: responde pela rota, na ordem das respostas dadas para cada uma. */
function fakeFetch(routes: Record<string, (Response | Error)[]>) {
  const calls: Call[] = [];
  const fn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      headers: init?.headers as Record<string, string>,
      ...(typeof init?.body === 'string' && { body: JSON.parse(init.body) as unknown }),
    });
    const key = `${method} ${new URL(url).pathname}`;
    const response = routes[key]?.shift();
    if (response === undefined) return Promise.reject(new Error(`rota inesperada: ${key}`));
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const token = `github_pat_${'s'.repeat(40)}`;
const repository = 'Orakel-AI-Content/platform';
const DISPATCH = 'POST /repos/Orakel-AI-Content/platform/actions/workflows/release.yml/dispatches';
const RUN = 'GET /repos/Orakel-AI-Content/platform/actions/runs/12345678901';
const runUrl = 'https://github.com/Orakel-AI-Content/platform/actions/runs/12345678901';

async function failure(promise: Promise<unknown>): Promise<GitHubError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(GitHubError);
  return error as GitHubError;
}

describe('githubClient', () => {
  it('dispara o workflow na ref com os inputs e devolve o id e o link do run', async () => {
    const { fn, calls } = fakeFetch({
      [DISPATCH]: [json({ workflow_run_id: 12345678901, run_url: 'x', html_url: runUrl })],
    });
    const run = await githubClient({ token, repository, fetch: fn }).dispatchWorkflow(
      'release.yml',
      'main',
      { version: '1.2.0' },
    );

    expect(run).toEqual({ runId: '12345678901', runUrl });
    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/Orakel-AI-Content/platform/actions/workflows/release.yml/dispatches',
    );
    expect(calls[0]?.body).toEqual({
      ref: 'main',
      inputs: { version: '1.2.0' },
      return_run_details: true,
    });
    expect(calls[0]?.headers).toMatchObject({
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
    });
  });

  it('lê o estado e a conclusão do run', async () => {
    const { fn } = fakeFetch({
      [RUN]: [
        json({ status: 'in_progress', conclusion: null, html_url: runUrl }),
        json({ status: 'completed', conclusion: 'failure', html_url: runUrl }),
      ],
    });
    const client = githubClient({ token, repository, fetch: fn });

    expect(await client.getRun('12345678901')).toEqual({
      status: 'in_progress',
      conclusion: null,
      runUrl,
    });
    expect(await client.getRun('12345678901')).toEqual({
      status: 'completed',
      conclusion: 'failure',
      runUrl,
    });
  });

  it('erro de rede, 5xx e limite de requisições são transitórios', async () => {
    const { fn } = fakeFetch({
      [RUN]: [
        new TypeError('fetch failed'),
        json({ message: 'Server Error' }, 502),
        json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' }),
        json({ message: 'secondary rate limit' }, 429),
      ],
    });
    const client = githubClient({ token, repository, fetch: fn });

    for (let i = 0; i < 4; i++) {
      expect((await failure(client.getRun('12345678901'))).transient).toBe(true);
    }
  });

  it('401, 403, 404 e 422 são definitivos, com motivo legível e sem o token', async () => {
    const { fn } = fakeFetch({
      [DISPATCH]: [
        json({ message: 'Bad credentials' }, 401),
        json({ message: 'Resource not accessible by personal access token' }, 403),
        json({ message: 'Not Found' }, 404),
        json({ message: "Unexpected inputs provided: ['versao']" }, 422),
      ],
    });
    const client = githubClient({ token, repository, fetch: fn });
    const dispatch = () => client.dispatchWorkflow('release.yml', 'main', { version: '1.2.0' });

    const errors = [
      await failure(dispatch()),
      await failure(dispatch()),
      await failure(dispatch()),
      await failure(dispatch()),
    ];
    expect(errors.map((e) => [e.status, e.transient])).toEqual([
      [401, false],
      [403, false],
      [404, false],
      [422, false],
    ]);
    expect(errors[0]?.message).toMatch(/GITHUB_RELEASE_TOKEN está inválido ou expirou/);
    expect(errors[1]?.message).toMatch(
      /actions:write e contents:read em Orakel-AI-Content\/platform/,
    );
    expect(errors[3]?.message).toMatch(/Unexpected inputs provided/);
    for (const error of errors) expect(error.message).not.toContain(token);
  });

  it('resposta do disparo sem o id do run é erro definitivo', async () => {
    const { fn } = fakeFetch({ [DISPATCH]: [new Response(null, { status: 204 })] });
    const error = await failure(
      githubClient({ token, repository, fetch: fn }).dispatchWorkflow('release.yml', 'main', {}),
    );
    expect(error.transient).toBe(false);
    expect(error.message).toMatch(/Resposta inesperada/);
  });
});
