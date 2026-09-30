import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';

import { getDb } from '../db/client.ts';
import { runProcess } from './run-process.ts';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

// Migrações do schema (Drizzle, só aditivas) e do schema graphile_worker. Idempotente.
await runProcess('backoffice-migrate', async (logger) => {
  const { pool, db } = getDb();
  await migrate(db, { migrationsFolder });
  await runMigrations({ pgPool: pool });
  logger.info('migrações aplicadas');
  await pool.end();
});
