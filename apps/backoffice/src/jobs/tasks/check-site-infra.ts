import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { recordInfraCheck, sitesForInfraCheck } from '../../domain/builds/site-state.ts';
import type { ZoneChecker } from '../../lib/cloudflare.ts';

export type CheckSiteInfraTaskDeps = {
  db: Db;
  /** Consulta da zona (Cloudflare ou edge-local, pelo DEPLOY_TARGET); falso nos testes. */
  zones: ZoneChecker;
  now?: () => Date;
};

function siteIdOf(payload: unknown): string | undefined {
  const siteId = (payload as { siteId?: unknown } | null)?.siteId;
  if (siteId === undefined) return undefined;
  if (typeof siteId !== 'string' || siteId === '') {
    throw new Error(`Payload da conferência da infra inválido: ${JSON.stringify(payload)}`);
  }
  return siteId;
}

/**
 * Conferência da infra (workspace#85): sem payload (cron), confere todos os sites em
 * `cadastrado`/`infra_aplicada`; com `{ siteId }` ("Conferir agora"), só aquele. Consulta a zona
 * do domínio principal fora da transação e, numa transação curta por site, grava a conferência e
 * avança a etapa. Falha da consulta fica gravada no site e não lança: quem repete é o cron. Site
 * sem domínio é pulado sem gravar nada; erro num site não interrompe os outros.
 */
export function createCheckSiteInfraTask(deps: CheckSiteInfraTaskDeps): Task {
  const now = deps.now ?? (() => new Date());
  return async (payload, helpers) => {
    const log = helpers.logger;
    const targets = await sitesForInfraCheck(deps.db, siteIdOf(payload));
    const errors: unknown[] = [];
    for (const { siteId, domain } of targets) {
      if (domain === undefined) {
        log.info(`conferência da infra de ${siteId} pulada: site sem domínio`);
        continue;
      }
      try {
        const status = await deps.zones.check(domain);
        const checkedAt = now();
        const lifecycle = await deps.db.transaction((tx) =>
          recordInfraCheck(tx, siteId, status, checkedAt),
        );
        if (status.kind === 'falha') {
          log.warn(`conferência da infra de ${siteId} (${domain}) falhou: ${status.message}`);
        } else {
          log.info(`infra de ${siteId} (${domain}): zona ${status.kind}, site em ${lifecycle}`);
        }
      } catch (error) {
        errors.push(error);
        log.error(`conferência da infra de ${siteId} não gravada: ${String(error)}`);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} site(s) sem conferência da infra gravada`);
    }
  };
}
