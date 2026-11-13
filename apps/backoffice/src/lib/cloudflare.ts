// Situação da zona de um site (workspace#85), só no backoffice-worker (ADR 0025 da raiz). Dois
// modos, pelo DEPLOY_TARGET: `cloudflare` lê a zona pela API com um token só de leitura;
// `local` não tem zona e pergunta ao edge-local se está no ar. `fetch` puro, no molde do
// lib/github.ts. A falha volta como valor (`falha`), nunca como exceção, para nunca ser
// confundida com "pendente"; o token só vai no cabeçalho e nenhuma mensagem o repete.
//
// No fim, a remoção do Worker do site (workspace#97), só no build-runner (ADR 0028 da raiz): o
// mesmo par de modos e o mesmo contrato de falha, com o token de deploy.

import { workerName } from '@orakel/build-contract';

import type { BuildRunnerEnv, ZoneCheckEnv } from '../env.ts';

/** Falha de uma chamada ao provedor; `transient` quando vale repetir. */
export type ProviderFailure = { kind: 'falha'; message: string; transient: boolean };

/**
 * - `inexistente`: a zona não existe na conta (infra ainda não aplicada);
 * - `pendente`: a zona existe, mas ainda não está ativa;
 * - `ativa`: `status=active` (no local: o edge-local respondeu);
 * - `falha`: o provedor não respondeu como esperado; `transient` quando vale repetir.
 */
export type ZoneStatus =
  | { kind: 'inexistente' }
  | { kind: 'pendente'; status: string }
  | { kind: 'ativa' }
  | ProviderFailure;

export interface ZoneChecker {
  /** Situação da zona do domínio principal do site (nome exato da zona). */
  check(domain: string): Promise<ZoneStatus>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

type Common = { fetch?: typeof fetch; timeoutMs?: number };

const failure = (message: string, transient: boolean): ProviderFailure => ({
  kind: 'falha',
  message,
  transient,
});

/** Texto do erro de rede sem o token (por precaução: o fetch não costuma repetir cabeçalhos). */
function describe(error: unknown, secret?: string): string {
  const text =
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      ? 'sem resposta no tempo limite'
      : String(error);
  return secret ? text.replaceAll(secret, '***') : text;
}

type CloudflareOptions = Common & {
  /** Token só de leitura de zona (CLOUDFLARE_ZONE_READ_TOKEN), nunca o de deploy. */
  token: string;
  /** Conta dona das zonas (CLOUDFLARE_ACCOUNT_ID): zona de outra conta não conta. */
  accountId: string;
  baseUrl?: string;
};

type ZonesBody = {
  success?: unknown;
  errors?: unknown;
  result?: unknown;
};

/** Primeira mensagem de `errors` da API da Cloudflare, se houver. */
function apiMessage(body: ZonesBody | undefined): string | undefined {
  if (!Array.isArray(body?.errors)) return undefined;
  const first = body.errors[0] as { message?: unknown } | undefined;
  return typeof first?.message === 'string' ? first.message : undefined;
}

export function cloudflareZoneChecker(options: CloudflareOptions): ZoneChecker {
  const base = (options.baseUrl ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { token } = options;
  const scrub = (text: string) => text.replaceAll(token, '***');

  return {
    async check(domain) {
      const url = new URL(`${base}/zones`);
      url.searchParams.set('name', domain);
      url.searchParams.set('account.id', options.accountId);

      let response: Response;
      try {
        response = await doFetch(url, {
          headers: { accept: 'application/json', authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return failure(`Cloudflare indisponível (zona ${domain}): ${describe(error, token)}`, true);
      }

      const text = await response.text().catch(() => '');
      let body: ZonesBody | undefined;
      try {
        body = JSON.parse(text) as ZonesBody;
      } catch {
        body = undefined;
      }
      const detail = scrub(apiMessage(body) ?? text.slice(0, 200));
      const status = response.status;

      if (status === 429 || status >= 500) {
        return failure(`Cloudflare respondeu ${status} (zona ${domain}): ${detail}`, true);
      }
      if (status === 401) {
        return failure(
          'A Cloudflare recusou a credencial: o CLOUDFLARE_ZONE_READ_TOKEN está inválido ou expirou',
          false,
        );
      }
      if (status === 403) {
        return failure(
          'A credencial da Cloudflare não tem permissão: o CLOUDFLARE_ZONE_READ_TOKEN precisa de Zone: Read na conta',
          false,
        );
      }
      if (!response.ok) {
        return failure(`Cloudflare respondeu ${status} (zona ${domain}): ${detail}`, false);
      }
      if (body?.success !== true || !Array.isArray(body.result)) {
        return failure(`Resposta inesperada da Cloudflare (zona ${domain}): ${detail}`, false);
      }

      const zone = body.result[0] as { status?: unknown } | undefined;
      if (zone === undefined) return { kind: 'inexistente' };
      if (typeof zone.status !== 'string') {
        return failure(
          `Resposta inesperada da Cloudflare (zona ${domain}): zona sem status`,
          false,
        );
      }
      // `pending`, `initializing` e `moved` contam como pendente: a zona existe na conta.
      return zone.status === 'active'
        ? { kind: 'ativa' }
        : { kind: 'pendente', status: zone.status };
    },
  };
}

type EdgeLocalOptions = Common & {
  /** API de administração do edge-local (EDGE_LOCAL_URL). */
  edgeLocalUrl: string;
};

/** No local não existe zona: todo site vale como ativo quando o edge-local responde ao /healthz. */
export function edgeLocalZoneChecker(options: EdgeLocalOptions): ZoneChecker {
  const url = `${options.edgeLocalUrl.replace(/\/$/, '')}/healthz`;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async check() {
      let response: Response;
      try {
        response = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        return failure(`edge-local indisponível: ${describe(error)}`, true);
      }
      await response.body?.cancel().catch(() => undefined);
      if (response.ok) return { kind: 'ativa' };
      // 503: o edge-local ainda está restaurando as versões ou subindo o proxy.
      return failure(`edge-local respondeu ${response.status} ao /healthz`, true);
    },
  };
}

/** Escolhe o modo pelo DEPLOY_TARGET (o env já exige as variáveis de cada um). */
export function zoneCheckerFrom(env: ZoneCheckEnv, common: Common = {}): ZoneChecker {
  if (env.DEPLOY_TARGET === 'local') {
    if (env.EDGE_LOCAL_URL === undefined) throw new Error('DEPLOY_TARGET=local sem EDGE_LOCAL_URL');
    return edgeLocalZoneChecker({ ...common, edgeLocalUrl: env.EDGE_LOCAL_URL });
  }
  if (env.CLOUDFLARE_ZONE_READ_TOKEN === undefined || env.CLOUDFLARE_ACCOUNT_ID === undefined) {
    throw new Error(
      'DEPLOY_TARGET=cloudflare sem CLOUDFLARE_ZONE_READ_TOKEN ou CLOUDFLARE_ACCOUNT_ID',
    );
  }
  return cloudflareZoneChecker({
    ...common,
    token: env.CLOUDFLARE_ZONE_READ_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  });
}

/**
 * - `removido`: o Worker existia e foi apagado;
 * - `inexistente`: não havia Worker (já removido ou nunca publicado), o que também é sucesso;
 * - `falha`: como no `ZoneStatus`.
 */
export type WorkerRemoval = { kind: 'removido' } | { kind: 'inexistente' } | ProviderFailure;

export interface WorkerRemover {
  /** Apaga o Worker `workerName(site)` do alvo de deploy. */
  remove(site: string): Promise<WorkerRemoval>;
}

type CloudflareRemoverOptions = Common & {
  /** Token de deploy (CLOUDFLARE_API_TOKEN), o mesmo do `wrangler deploy`. */
  token: string;
  /** Conta dona dos Workers (CLOUDFLARE_ACCOUNT_ID). */
  accountId: string;
  baseUrl?: string;
};

/** `DELETE` do script na API da Cloudflare, sem `force`: binding de outro script recusa. */
export function cloudflareWorkerRemover(options: CloudflareRemoverOptions): WorkerRemover {
  const base = (options.baseUrl ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { token } = options;
  const scrub = (text: string) => text.replaceAll(token, '***');

  return {
    async remove(site) {
      const name = workerName(site);
      const url = `${base}/accounts/${encodeURIComponent(options.accountId)}/workers/scripts/${encodeURIComponent(name)}`;

      let response: Response;
      try {
        response = await doFetch(url, {
          method: 'DELETE',
          headers: { accept: 'application/json', authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return failure(`Cloudflare indisponível (Worker ${name}): ${describe(error, token)}`, true);
      }

      const text = await response.text().catch(() => '');
      let body: ZonesBody | undefined;
      try {
        body = JSON.parse(text) as ZonesBody;
      } catch {
        body = undefined;
      }
      const detail = scrub(apiMessage(body) ?? text.slice(0, 200));
      const status = response.status;

      if (response.ok) return { kind: 'removido' };
      if (status === 404) return { kind: 'inexistente' };
      if (status === 429 || status >= 500) {
        return failure(`Cloudflare respondeu ${status} (Worker ${name}): ${detail}`, true);
      }
      if (status === 401) {
        return failure(
          'A Cloudflare recusou a credencial: o CLOUDFLARE_API_TOKEN está inválido ou expirou',
          false,
        );
      }
      if (status === 403) {
        return failure(
          'A credencial da Cloudflare não tem permissão: o CLOUDFLARE_API_TOKEN precisa de Workers Scripts: Edit na conta',
          false,
        );
      }
      return failure(`Cloudflare respondeu ${status} (Worker ${name}): ${detail}`, false);
    },
  };
}

/** No local, o Worker do site é o conjunto de versões no edge-local (`DELETE /sites/<site>`). */
export function edgeLocalWorkerRemover(options: EdgeLocalOptions): WorkerRemover {
  const base = options.edgeLocalUrl.replace(/\/$/, '');
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async remove(site) {
      let response: Response;
      try {
        response = await doFetch(`${base}/sites/${encodeURIComponent(site)}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return failure(`edge-local indisponível: ${describe(error)}`, true);
      }
      const text = await response.text().catch(() => '');
      if (response.ok) return { kind: 'removido' };
      // 409: outra operação no site (publish ou rollback) em andamento; 5xx: erro do edge-local.
      const transient = response.status === 409 || response.status >= 500;
      return failure(
        `edge-local respondeu ${response.status} ao remover ${site}: ${text.slice(0, 200)}`,
        transient,
      );
    },
  };
}

/** Escolhe o modo pelo DEPLOY_TARGET do build-runner (o env já exige as variáveis de cada um). */
export function workerRemoverFrom(
  env: Pick<
    BuildRunnerEnv,
    'DEPLOY_TARGET' | 'EDGE_LOCAL_URL' | 'CLOUDFLARE_API_TOKEN' | 'CLOUDFLARE_ACCOUNT_ID'
  >,
  common: Common = {},
): WorkerRemover {
  if (env.DEPLOY_TARGET === 'local') {
    if (env.EDGE_LOCAL_URL === undefined) throw new Error('DEPLOY_TARGET=local sem EDGE_LOCAL_URL');
    return edgeLocalWorkerRemover({ ...common, edgeLocalUrl: env.EDGE_LOCAL_URL });
  }
  if (env.CLOUDFLARE_API_TOKEN === undefined || env.CLOUDFLARE_ACCOUNT_ID === undefined) {
    throw new Error('DEPLOY_TARGET=cloudflare sem CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID');
  }
  return cloudflareWorkerRemover({
    ...common,
    token: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  });
}
