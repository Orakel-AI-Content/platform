import { describe, expect, it } from 'vitest';

import { parseEnv } from './env.ts';

const valid = {
  DATABASE_URL: 'postgres://orakel:x@localhost:5432/orakel',
  ACCESS_TEAM_DOMAIN: 'orakel.cloudflareaccess.com',
  ACCESS_JWKS_URL: 'https://orakel.cloudflareaccess.com/cdn-cgi/access/certs',
  ACCESS_AUD: 'aud',
  EXPORT_BUILD_TOKEN: 'b'.repeat(32),
  EXPORT_PREVIEW_TOKEN: 'p'.repeat(32),
  GENERATOR_TOKEN: 'g'.repeat(32),
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
};

describe('parseEnv', () => {
  it('aceita o ambiente completo, com padrões', () => {
    expect(parseEnv(valid)).toMatchObject({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('falha no boot listando tudo o que falta ou é inválido', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined, GENERATOR_TOKEN: 'curto' })).toThrow(
      /DATABASE_URL[\s\S]*GENERATOR_TOKEN/,
    );
  });

  it('SENTRY_DSN e HEARTBEAT_BASE_URL vazios desligam as integrações', () => {
    expect(parseEnv({ ...valid, SENTRY_DSN: '', HEARTBEAT_BASE_URL: '' })).toMatchObject({
      SENTRY_DSN: '',
    });
  });
});
