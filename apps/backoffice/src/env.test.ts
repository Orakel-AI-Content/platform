import { describe, expect, it } from 'vitest';

import { parseAudienceEnv, parseBuildRunnerEnv, parseDatabaseEnv, parseEnv } from './env.ts';

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
  LLM_API_KEY: 'sk-ant-teste',
};

describe('parseEnv', () => {
  it('aceita o ambiente completo, com padrões', () => {
    expect(parseEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      BUILD_WINDOW_SECONDS: 900,
      PUBLISH_DAILY_LIMIT: 10,
    });
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

describe('parseEnv: geração (LLM_*)', () => {
  it('padrão anthropic:claude-haiku-5-5, sem tabela de preços', () => {
    expect(parseEnv(valid)).toMatchObject({
      LLM_MODEL: 'anthropic:claude-haiku-5-5',
      LLM_API_KEY: 'sk-ant-teste',
      LLM_PRICING: {},
    });
    expect(parseEnv({ ...valid, LLM_MODEL: '', LLM_PRICING: '' })).toMatchObject({
      LLM_MODEL: 'anthropic:claude-haiku-5-5',
      LLM_PRICING: {},
    });
  });

  it('a chave do provedor é obrigatória fora do modo fixture', () => {
    expect(() => parseEnv({ ...valid, LLM_API_KEY: undefined })).toThrow(/LLM_API_KEY/);
    expect(() => parseEnv({ ...valid, LLM_API_KEY: '' })).toThrow(/LLM_API_KEY/);
    expect(parseEnv({ ...valid, LLM_API_KEY: '', LLM_MODEL: 'fixture' })).toMatchObject({
      LLM_MODEL: 'fixture',
    });
  });

  it('só aceita fixture ou anthropic:<modelo>', () => {
    expect(parseEnv({ ...valid, LLM_MODEL: 'anthropic:claude-sonnet-5-5' }).LLM_MODEL).toBe(
      'anthropic:claude-sonnet-5-5',
    );
    expect(() => parseEnv({ ...valid, LLM_MODEL: 'openai:gpt' })).toThrow(/LLM_MODEL/);
    expect(() => parseEnv({ ...valid, LLM_MODEL: 'claude-haiku-5-5' })).toThrow(/LLM_MODEL/);
  });

  it('a rota interna do gerador é o backoffice-web da rede internal, por padrão', () => {
    expect(parseEnv(valid).GENERATOR_API_URL).toBe('http://backoffice-web:3000');
    expect(parseEnv({ ...valid, GENERATOR_API_URL: '' }).GENERATOR_API_URL).toBe(
      'http://backoffice-web:3000',
    );
    expect(
      parseEnv({ ...valid, GENERATOR_API_URL: 'http://localhost:3000' }).GENERATOR_API_URL,
    ).toBe('http://localhost:3000');
    expect(() => parseEnv({ ...valid, GENERATOR_API_URL: 'nao-e-url' })).toThrow(
      /GENERATOR_API_URL/,
    );
  });

  it('lê a tabela de preços em JSON e recusa JSON ou preço inválido', () => {
    const pricing = '{"anthropic:claude-haiku-5-5":{"input":0.1,"output":0.5}}';
    expect(parseEnv({ ...valid, LLM_PRICING: pricing }).LLM_PRICING).toEqual({
      'anthropic:claude-haiku-5-5': { input: 0.1, output: 0.5 },
    });
    expect(() => parseEnv({ ...valid, LLM_PRICING: '{x' })).toThrow(/LLM_PRICING/);
    expect(() => parseEnv({ ...valid, LLM_PRICING: '{"m":{"input":-1,"output":0}}' })).toThrow(
      /LLM_PRICING/,
    );
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

describe('parseAudienceEnv (#545)', () => {
  const audience = {
    AE_SQL_TRANSPORT: 'clickhouse',
    AE_SQL_URL: 'http://orakel:orakel-local@localhost:8123',
  };

  it('aceita o transporte clickhouse com a URL', () => {
    expect(parseAudienceEnv(audience)).toEqual(audience);
  });

  it('recusa transporte diferente de clickhouse e URL inválida, sem repetir a URL', () => {
    expect(() => parseAudienceEnv({ ...audience, AE_SQL_TRANSPORT: 'cloudflare' })).toThrow(
      /AE_SQL_TRANSPORT/,
    );
    expect(() => parseAudienceEnv({ ...audience, AE_SQL_TRANSPORT: undefined })).toThrow(
      /AE_SQL_TRANSPORT/,
    );
    expect(() => parseAudienceEnv({ ...audience, AE_SQL_URL: 'orakel-local@clickhouse' })).toThrow(
      /^(?![\s\S]*orakel-local)[\s\S]*AE_SQL_URL/,
    );
  });

  it('o ambiente do app não exige AE_SQL_*', () => {
    expect(() => parseEnv(valid)).not.toThrow();
  });
});
