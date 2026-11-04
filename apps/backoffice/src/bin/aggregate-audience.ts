import { getDb } from '../db/client.ts';
import { enqueueAudienceAggregation } from '../domain/audience/schedule.ts';
import { runProcess } from './run-process.ts';

// Consolidação da audiência na hora (comando da operação e carga sintética):
// `audience:aggregate` enfileira o job aggregate-audience na fila `audience`, e o
// backoffice-worker consolida a janela padrão (ontem e hoje de São Paulo) sem esperar o cron.
await runProcess('backoffice-audience-aggregate', async (logger) => {
  const { pool, db } = getDb();
  await enqueueAudienceAggregation(db);
  await pool.end();
  logger.info('consolidação da audiência enfileirada');
});
