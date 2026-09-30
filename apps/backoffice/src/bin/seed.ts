import { readFile } from 'node:fs/promises';

import { parseSnapshotLine, type SnapshotLine } from '@orakel/content-model/v1';

import { getDb } from '../db/client.ts';
import { SYSTEM_ACTOR } from '../domain/access/rbac.ts';
import { upsertUser } from '../domain/access/users.ts';
import { importSnapshot } from '../domain/import/import-snapshot.ts';
import { siteExists } from '../domain/sites/sites.ts';
import { runProcess } from './run-process.ts';

/** Um usuário de teste por papel: os mesmos e-mails do access-mock. */
export const TEST_USERS = [
  { email: 'admin@orakel.local', name: 'Admin de teste', roles: ['admin'] },
  { email: 'editor@orakel.local', name: 'Editor de teste', roles: ['editor'] },
  { email: 'revisor@orakel.local', name: 'Revisor de teste', roles: ['revisor'] },
  { email: 'operacao@orakel.local', name: 'Operação de teste', roles: ['operacao'] },
] as const;

const FIXTURES = ['exemplo-a', 'exemplo-b'];

export async function readFixture(site: string): Promise<SnapshotLine[]> {
  const url = import.meta.resolve(`@orakel/content-model/fixtures/v1/${site}.ndjson`);
  const text = await readFile(new URL(url), 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      const parsed = parseSnapshotLine(JSON.parse(line) as unknown);
      if (!parsed.ok)
        throw new Error(`Fixture ${site}, linha ${index + 1}: ${JSON.stringify(parsed.issues)}`);
      return parsed.value;
    });
}

// Dados de exemplo do ambiente local: usuários de teste e os dois sites das fixtures.
// Idempotente: site que já existe é pulado.
if (import.meta.main) {
  await runProcess('backoffice-seed', async (logger) => {
    const { pool, db } = getDb();
    for (const user of TEST_USERS) await upsertUser(db, user);
    for (const site of FIXTURES) {
      if (await siteExists(db, site)) {
        logger.info({ siteId: site }, 'site já existe; pulado');
        continue;
      }
      const result = await importSnapshot(db, { ...SYSTEM_ACTOR }, await readFixture(site));
      if (!result.ok) throw new Error(`Seed de ${site}: ${JSON.stringify(result.issues)}`);
      logger.info({ siteId: site }, 'site importado');
    }
    await pool.end();
  });
}
