import { getDb } from '../db/client.ts';
import { scheduleMediaReprocess } from '../domain/media/reprocess.ts';
import { runProcess } from './run-process.ts';

// Reprocessamento das variantes (comando da operação): `media:reprocess [site]` enfileira o
// job media-reprocess do site, ou de todos os sites sem argumento; o backoffice-worker
// gera só as variantes que faltam no perfil de imagem.
await runProcess('backoffice-media-reprocess', async (logger) => {
  const { pool, db } = getDb();
  const scheduled = await scheduleMediaReprocess(db, process.argv[2]);
  await pool.end();
  if (!scheduled.ok) throw new Error(scheduled.issues.map((issue) => issue.message).join('; '));
  logger.info(
    { sites: scheduled.value },
    `reprocessamento enfileirado para ${scheduled.value.length} site(s)`,
  );
});
