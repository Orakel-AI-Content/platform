import type { JobHelpers } from 'graphile-worker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SiteStateModule from '../../domain/builds/site-state.ts';

import type { Db } from '../../db/client.ts';
import type { ZoneChecker, ZoneStatus } from '../../lib/cloudflare.ts';
import { createCheckSiteInfraTask } from './check-site-infra.ts';

// A gravação e o avanço são espionados; o banco de verdade fica no contrato
// (sites.contract.test.ts).
const mocks = vi.hoisted(() => ({
  sitesForInfraCheck: vi.fn(),
  recordInfraCheck: vi.fn(),
}));
vi.mock('../../domain/builds/site-state.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof SiteStateModule>()),
  ...mocks,
}));

const tx = { tx: true };
const db = { transaction: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as Db;
const NOW = Date.parse('2026-11-12T12:00:00Z');

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.recordInfraCheck.mockResolvedValue('infra_aplicada');
});

function fakeZones(byDomain: Record<string, ZoneStatus>) {
  const checked: string[] = [];
  const zones: ZoneChecker = {
    check(domain) {
      checked.push(domain);
      const status = byDomain[domain];
      return status === undefined
        ? Promise.reject(new Error(`domínio inesperado ${domain}`))
        : Promise.resolve(status);
    },
  };
  return { zones, checked };
}

function run(zones: ZoneChecker, payload: unknown = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const done = createCheckSiteInfraTask({ db, zones, now: () => NOW })(payload, {
    logger,
  } as unknown as JobHelpers);
  return { done, logger };
}

describe('check-site-infra', () => {
  it('sem payload confere todos os sites e grava cada resultado na transação', async () => {
    mocks.sitesForInfraCheck.mockResolvedValue([
      { siteId: 'a', domain: 'a.com.br' },
      { siteId: 'b', domain: 'b.com.br' },
    ]);
    const { zones, checked } = fakeZones({
      'a.com.br': { kind: 'pendente', status: 'pending' },
      'b.com.br': { kind: 'ativa' },
    });
    await run(zones, null).done;

    expect(mocks.sitesForInfraCheck).toHaveBeenCalledWith(db, undefined);
    expect(checked).toEqual(['a.com.br', 'b.com.br']);
    expect(mocks.recordInfraCheck.mock.calls).toEqual([
      [tx, 'a', { kind: 'pendente', status: 'pending' }, new Date(NOW)],
      [tx, 'b', { kind: 'ativa' }, new Date(NOW)],
    ]);
  });

  it('com { siteId } confere só aquele site', async () => {
    mocks.sitesForInfraCheck.mockResolvedValue([{ siteId: 'a', domain: 'a.com.br' }]);
    await run(fakeZones({ 'a.com.br': { kind: 'inexistente' } }).zones, { siteId: 'a' }).done;

    expect(mocks.sitesForInfraCheck).toHaveBeenCalledWith(db, 'a');
    expect(mocks.recordInfraCheck).toHaveBeenCalledWith(
      tx,
      'a',
      { kind: 'inexistente' },
      new Date(NOW),
    );
  });

  it('falha da consulta é gravada e não lança: quem repete é o cron', async () => {
    mocks.sitesForInfraCheck.mockResolvedValue([{ siteId: 'a', domain: 'a.com.br' }]);
    const falha: ZoneStatus = {
      kind: 'falha',
      message: 'Cloudflare respondeu 503',
      transient: true,
    };
    const { done, logger } = run(fakeZones({ 'a.com.br': falha }).zones);
    await done;

    expect(mocks.recordInfraCheck).toHaveBeenCalledWith(tx, 'a', falha, new Date(NOW));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cloudflare respondeu 503'));
  });

  it('site sem domínio é pulado sem consultar nem gravar', async () => {
    mocks.sitesForInfraCheck.mockResolvedValue([{ siteId: 'a', domain: undefined }]);
    const { zones, checked } = fakeZones({});
    await run(zones).done;

    expect(checked).toEqual([]);
    expect(mocks.recordInfraCheck).not.toHaveBeenCalled();
  });

  it('erro num site não interrompe os outros, e o job termina com erro', async () => {
    mocks.sitesForInfraCheck.mockResolvedValue([
      { siteId: 'a', domain: 'a.com.br' },
      { siteId: 'b', domain: 'b.com.br' },
    ]);
    mocks.recordInfraCheck.mockRejectedValueOnce(new Error('conexão perdida'));
    const { zones } = fakeZones({ 'a.com.br': { kind: 'ativa' }, 'b.com.br': { kind: 'ativa' } });

    await expect(run(zones).done).rejects.toThrow('1 site(s) sem conferência da infra gravada');
    expect(mocks.recordInfraCheck).toHaveBeenCalledTimes(2);
  });

  it('recusa siteId inválido no payload', async () => {
    await expect(run(fakeZones({}).zones, { siteId: 42 }).done).rejects.toThrow(
      'Payload da conferência da infra inválido',
    );
    expect(mocks.sitesForInfraCheck).not.toHaveBeenCalled();
  });
});
