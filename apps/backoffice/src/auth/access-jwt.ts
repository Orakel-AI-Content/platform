import type { Result } from '@orakel/content-model';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { Env } from '../env.ts';

// JWT do Cloudflare Access (Cf-Access-Jwt-Assertion), validado em cada requisição. Local:
// o access-mock emite com o mesmo contrato; só as variáveis ACCESS_* mudam.

export type AccessConfig = { issuer: string; audience: string; keys: JWTVerifyGetKey };

export function accessConfigFromEnv(
  env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD' | 'ACCESS_JWKS_URL'>,
): AccessConfig {
  return {
    issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
    audience: env.ACCESS_AUD,
    keys: createRemoteJWKSet(new URL(env.ACCESS_JWKS_URL)),
  };
}

const unauthorized = (message: string): Result<never> => ({
  ok: false,
  issues: [{ code: 'unauthorized', message, path: [] }],
});

/** Devolve o e-mail da pessoa autenticada; qualquer falha é `unauthorized`, sem detalhe. */
export async function verifyAccessToken(
  token: string | null | undefined,
  config: AccessConfig,
): Promise<Result<{ email: string }>> {
  if (!token) return unauthorized('Sem JWT do Access');
  try {
    const { payload } = await jwtVerify(token, config.keys, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
    });
    if (typeof payload.email !== 'string' || payload.email === '')
      return unauthorized('JWT sem e-mail');
    return { ok: true, value: { email: payload.email } };
  } catch {
    return unauthorized('JWT do Access inválido');
  }
}
