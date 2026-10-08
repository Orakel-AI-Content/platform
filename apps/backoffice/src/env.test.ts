import { describe, expect, it } from 'vitest';

import { parseBuildRunnerEnv, parseDatabaseEnv, parseEnv } from './env.ts';

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
  PREVIEW_BASE_URL: 'https://preview.orakel.localhost',
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

  it('exige a URL da visualização da revisão', () => {
    expect(() => parseEnv({ ...valid, PREVIEW_BASE_URL: undefined })).toThrow(/PREVIEW_BASE_URL/);
    expect(() => parseEnv({ ...valid, PREVIEW_BASE_URL: 'preview' })).toThrow(/PREVIEW_BASE_URL/);
  });

  it('a página de erro do E2E fica desligada sem E2E_ERROR_ROUTE', () => {
    expect(parseEnv(valid).E2E_ERROR_ROUTE).toBe(false);
    expect(parseEnv({ ...valid, E2E_ERROR_ROUTE: '1' }).E2E_ERROR_ROUTE).toBe(true);
  });

  it('SENTRY_DSN e HEARTBEAT_BASE_URL vazios desligam as integrações', () => {
    expect(parseEnv({ ...valid, SENTRY_DSN: '', HEARTBEAT_BASE_URL: '' })).toMatchObject({
      SENTRY_DSN: '',
    });
  });
});

describe('parseBuildRunnerEnv', () => {
  const runner = {
    DOCKER_HOST: 'tcp://docker-socket-proxy:2375',
    SITE_BUILDER_IMAGE: 'ghcr.io/orakel-ai-content/site-builder',
    EDGE_LOCAL_URL: 'http://edge-local:8081',
  };

  it('alvo local com os padrões das redes e da tag', () => {
    expect(parseBuildRunnerEnv(runner)).toMatchObject({
      DEPLOY_TARGET: 'local',
      SITE_BUILDER_TAG: 'local',
      BUILD_EXPORT_NETWORK: 'orakel-export',
      BUILD_PUBLISH_NETWORK: 'orakel-publish',
    });
  });

  it('cada alvo exige o próprio destino', () => {
    expect(() => parseBuildRunnerEnv({ ...runner, EDGE_LOCAL_URL: undefined })).toThrow(
      /EDGE_LOCAL_URL/,
    );
    expect(() => parseBuildRunnerEnv({ ...runner, DEPLOY_TARGET: 'cloudflare' })).toThrow(
      /CLOUDFLARE_API_TOKEN/,
    );
  });

  it('variável vazia (repassada pelo compose) conta como ausente', () => {
    expect(() =>
      parseBuildRunnerEnv({
        ...runner,
        DEPLOY_TARGET: 'cloudflare',
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_ACCOUNT_ID: '',
      }),
    ).toThrow(/CLOUDFLARE_API_TOKEN/);
    expect(parseBuildRunnerEnv({ ...runner, CLOUDFLARE_API_TOKEN: '' })).toMatchObject({
      DEPLOY_TARGET: 'local',
    });
  });

  it('o Docker é sempre por TCP (o proxy), nunca pelo socket', () => {
    expect(() =>
      parseBuildRunnerEnv({ ...runner, DOCKER_HOST: 'unix:///var/run/docker.sock' }),
    ).toThrow(/DOCKER_HOST/);
  });
});

describe('parseDatabaseEnv (#145)', () => {
  it('exige só a DATABASE_URL: o resto do ambiente do app pode faltar', () => {
    expect(parseDatabaseEnv({ DATABASE_URL: valid.DATABASE_URL })).toBe(valid.DATABASE_URL);
    // Sem PREVIEW_BASE_URL (e o resto), o ambiente completo recusa; o do banco, não.
    expect(() => parseEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/PREVIEW_BASE_URL/);
  });

  it('sem DATABASE_URL, ou com uma URL inválida, recusa com o nome da variável', () => {
    expect(() => parseDatabaseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseDatabaseEnv({ DATABASE_URL: 'banco' })).toThrow(/DATABASE_URL/);
  });
});
