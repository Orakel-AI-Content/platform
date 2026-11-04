import type { Task } from 'graphile-worker';

import type { Db } from '../../db/client.ts';
import { consolidateAudience } from '../../domain/audience/consolidate.ts';
import { AGGREGATE_AUDIENCE_TASK, defaultAudienceWindow } from '../../domain/audience/schedule.ts';
import type { AeSqlClient } from '../../domain/audience/sql.ts';
import { findAudienceEnv } from '../../env.ts';
import { aeSqlClient } from '../../lib/clickhouse.ts';
import { pingHeartbeat } from '../../lib/heartbeat.ts';

export type AggregateAudienceTaskDeps = {
  db: Db;
  /** Cliente do AE pelas `AE_SQL_*`; `undefined` quando elas não existem. */
  aeClient?: () => AeSqlClient | undefined;
  now?: () => Date;
  heartbeat?: (name: string) => Promise<boolean>;
};

function clientFromEnv(): AeSqlClient | undefined {
  const env = findAudienceEnv();
  return env === undefined ? undefined : aeSqlClient(env);
}

/**
 * Consolidação horária da audiência (#547, workspace#24 R1): regrava ontem e hoje de São Paulo
 * a partir do Analytics Engine e pinga o heartbeat ao terminar. O cliente do AE nasce na
 * primeira execução, não na partida; sem `AE_SQL_*`, avisa e sai sem consolidar nem pingar
 * (o heartbeat ausente é o sinal). Falha do AE ou do banco lança e o Graphile Worker repete.
 * Logs só com dia, site e contagens: nunca a URL do AE.
 */
export function createAggregateAudienceTask(deps: AggregateAudienceTaskDeps): Task {
  const loadClient = deps.aeClient ?? clientFromEnv;
  const now = deps.now ?? (() => new Date());
  const heartbeat =
    deps.heartbeat ?? ((name: string) => pingHeartbeat(process.env.HEARTBEAT_BASE_URL, name));
  let ae: AeSqlClient | undefined;

  return async (_payload, helpers) => {
    ae ??= loadClient();
    if (ae === undefined) {
      helpers.logger.warn('audiência não consolidada: AE_SQL_TRANSPORT e AE_SQL_URL ausentes');
      return;
    }
    const result = await consolidateAudience(deps.db, ae, defaultAudienceWindow(now()));
    const { from, to } = result.window;
    helpers.logger.info(
      `audiência consolidada de ${from} a ${to}: ${result.siteRows} dia(s) de site, ` +
        `${result.articleRows} dia(s) de artigo`,
    );
    if (result.unknownSites.length > 0) {
      helpers.logger.warn(
        `audiência de sites fora do cadastro ignorada: ${result.unknownSites.join(', ')}`,
      );
    }
    await heartbeat(AGGREGATE_AUDIENCE_TASK);
  };
}
