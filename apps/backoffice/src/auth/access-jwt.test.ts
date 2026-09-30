import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { verifyAccessToken, type AccessConfig } from './access-jwt.ts';

const ISSUER = 'https://orakel-teste.cloudflareaccess.com';
const AUD = 'aud-de-teste';

let config: AccessConfig;
let sign: (
  claims: Record<string, unknown>,
  options?: { exp?: string; iss?: string; aud?: string },
) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  config = { issuer: ISSUER, audience: AUD, keys: createLocalJWKSet({ keys: [jwk] }) };
  sign = (claims, options = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(options.iss ?? ISSUER)
      .setAudience(options.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(options.exp ?? '5m')
      .sign(privateKey);
});

describe('verifyAccessToken', () => {
  it('aceita o JWT do Access e devolve o e-mail', async () => {
    const token = await sign({ email: 'ana@orakel.local' });
    expect(await verifyAccessToken(token, config)).toEqual({
      ok: true,
      value: { email: 'ana@orakel.local' },
    });
  });

  it.each([
    ['sem token', () => Promise.resolve(null)],
    ['outra audiência', async () => sign({ email: 'a@b.c' }, { aud: 'outra' })],
    ['outro emissor', async () => sign({ email: 'a@b.c' }, { iss: 'https://mal.com' })],
    ['expirado', async () => sign({ email: 'a@b.c' }, { exp: '-1m' })],
    ['sem e-mail', async () => sign({ sub: 'x' })],
    ['assinatura adulterada', async () => `${await sign({ email: 'a@b.c' })}x`],
  ])('recusa %s como unauthorized, sem detalhe', async (_, token) => {
    expect(await verifyAccessToken(await token(), config)).toMatchObject({
      ok: false,
      issues: [{ code: 'unauthorized' }],
    });
  });
});
