import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  EXIT_CODES,
  EdgeLocalRollbackSchema,
  INFRA_DIR,
  INFRA_PATHS,
  InfraApplyResultSchema,
  InfraPlanResultSchema,
  PATHS,
  PublishResultSchema,
  ResultSchema,
  RollbackResultSchema,
  exitCodeOf,
  workerName,
} from './index.ts';

const base = { formatVersion: 1, site: 'exemplo-a', release: 'local', durationMs: 1200 };

describe('result.json', () => {
  it('sucesso traz as mudanças, as contagens e o uso de redirects', () => {
    const parsed = ResultSchema.safeParse({
      ...base,
      status: 'ok',
      pendingChangeIds: [1, 2],
      pages: 12,
      files: 43,
      redirectUsage: {
        static: 0,
        dynamic: 0,
        limits: { static: 2000, dynamic: 100 },
        alert: false,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('falha traz o tipo e a mensagem; versão de formato diferente é recusada', () => {
    const failed = { ...base, status: 'failed', failure: { kind: 'permanent', message: 'trava' } };
    expect(ResultSchema.safeParse(failed).success).toBe(true);
    expect(ResultSchema.safeParse({ ...failed, formatVersion: 2 }).success).toBe(false);
    expect(
      ResultSchema.safeParse({ ...failed, failure: { kind: 'talvez', message: 'x' } }).success,
    ).toBe(false);
  });

  it('falha pode apontar o conteúdo culpado; sem o campo continua válida', () => {
    const failed = { ...base, status: 'failed', failure: { kind: 'permanent', message: 'trava' } };
    const withCulprit = (culprit: unknown) =>
      ResultSchema.safeParse({ ...failed, failure: { ...failed.failure, culprit } }).success;
    expect(ResultSchema.safeParse(failed).success).toBe(true);
    expect(withCulprit({ origin: 'content', reference: '42' })).toBe(true);
    expect(withCulprit({ origin: 'config', reference: 'config' })).toBe(true);
    expect(withCulprit({ origin: 'release', reference: 'r1' })).toBe(false);
    expect(withCulprit({ origin: 'content', reference: '' })).toBe(false);
  });
});

describe('publish.json', () => {
  it('sucesso traz a versão publicada e a chave do build-cache', () => {
    const parsed = PublishResultSchema.safeParse({
      formatVersion: 1,
      status: 'ok',
      site: 'exemplo-a',
      target: 'local',
      versionId: '20260930T210249Z-4032e8d6',
      cacheKey: 'exemplo-a/20260930T210249Z-4032e8d6.tar.gz',
      durationMs: 2944,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('rollback.json', () => {
  const ok = {
    formatVersion: 1,
    status: 'ok',
    site: 'exemplo-a',
    target: 'cloudflare',
    versionId: 'c0ffee',
    durationMs: 800,
  };
  it('sucesso traz o alvo e a versão ativa; falha traz o tipo', () => {
    expect(RollbackResultSchema.safeParse(ok).success).toBe(true);
    expect(RollbackResultSchema.safeParse({ ...ok, versionId: '' }).success).toBe(false);
    expect(
      RollbackResultSchema.safeParse({
        formatVersion: 1,
        status: 'failed',
        site: 'exemplo-a',
        failure: { kind: 'transient', message: 'x' },
        durationMs: 0,
      }).success,
    ).toBe(true);
  });
  it('evolução aditiva: mesma versão de formato, arquivo próprio', () => {
    expect(CONTRACT_VERSION).toBe(1);
    expect(PATHS.rollback).toBe('rollback.json');
    expect(EdgeLocalRollbackSchema.parse({ active: 'v1' })).toEqual({ active: 'v1' });
  });
});

describe('infra-plan.json e infra-apply.json (volume /infra)', () => {
  const infra = { formatVersion: 1, site: 'exemplo-a', durationMs: 4200 };
  const failed = {
    ...infra,
    status: 'failed',
    failure: { kind: 'permanent', message: 'Defina TOFU_STATE_PASSPHRASE' },
  };

  it('volume próprio, separado do /build', () => {
    expect(INFRA_DIR).toBe('/infra');
    expect(INFRA_PATHS).toEqual({
      plan: 'site.tfplan',
      planResult: 'infra-plan.json',
      applyResult: 'infra-apply.json',
    });
  });

  it('plano ok traz os recursos que mudam, com a ação de cada um', () => {
    const ok = {
      ...infra,
      status: 'ok',
      changes: [
        { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone', action: 'create' },
        {
          address: 'module.site.cloudflare_dns_record.spf',
          type: 'cloudflare_dns_record',
          action: 'replace',
        },
      ],
    };
    expect(InfraPlanResultSchema.safeParse(ok).success).toBe(true);
    expect(InfraPlanResultSchema.safeParse({ ...ok, changes: [] }).success).toBe(true);
    const noop = { ...ok, changes: [{ address: 'x.y', type: 'x', action: 'no-op' }] };
    expect(InfraPlanResultSchema.safeParse(noop).success).toBe(false);
  });

  it('apply ok traz nameservers, zona e o estado do Crawler Hints', () => {
    const ok = {
      ...infra,
      status: 'ok',
      nameServers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
      zoneId: '023e105f4ecef8ad9ca31a8372d0c353',
      crawlerHints: 'ligado',
    };
    expect(InfraApplyResultSchema.safeParse(ok).success).toBe(true);
    expect(InfraApplyResultSchema.safeParse({ ...ok, crawlerHints: 'falhou' }).success).toBe(true);
    expect(InfraApplyResultSchema.safeParse({ ...ok, nameServers: [] }).success).toBe(false);
    expect(InfraApplyResultSchema.safeParse({ ...ok, crawlerHints: 'talvez' }).success).toBe(false);
  });

  it('falha traz o tipo e a mensagem, nos dois arquivos', () => {
    expect(InfraPlanResultSchema.safeParse(failed).success).toBe(true);
    expect(InfraApplyResultSchema.safeParse(failed).success).toBe(true);
    expect(InfraApplyResultSchema.safeParse({ ...failed, formatVersion: 2 }).success).toBe(false);
  });
});

describe('códigos de saída', () => {
  it('concordam com o status e o tipo da falha', () => {
    expect(exitCodeOf({ status: 'ok' })).toBe(EXIT_CODES.ok);
    expect(exitCodeOf({ status: 'failed', failure: { kind: 'permanent', message: 'x' } })).toBe(10);
    expect(exitCodeOf({ status: 'failed', failure: { kind: 'transient', message: 'x' } })).toBe(20);
  });
});

describe('workerName', () => {
  it('é orakel-<site>', () => {
    expect(workerName('exemplo-a')).toBe('orakel-exemplo-a');
  });
});
