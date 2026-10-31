import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readFixture, readLocalSites, TEST_USERS, withLocalDomains } from '../../src/bin/seed.ts';
import { createDb, createPool } from '../../src/db/client.ts';
import { SYSTEM_ACTOR } from '../../src/domain/access/rbac.ts';
import { upsertUser } from '../../src/domain/access/users.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { siteExists } from '../../src/domain/sites/sites.ts';
import { getDatabaseUrl } from '../../src/env.ts';

// Banco da camada `telas` (#474): migrações, os usuários de teste e os sites das fixtures, o
// que o `local:seed` faz sem a mídia dos sites completos (que vai para o S3). Idempotente:
// site que já existe é pulado, como no seed.

const APP_DIR = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = ['exemplo-a', 'exemplo-b'];

export default async function globalSetup(): Promise<void> {
  // O migrate.ts roda no import (é um bin): processo próprio, como o `pnpm db:migrate`.
  execFileSync(process.execPath, ['src/bin/migrate.ts'], { cwd: APP_DIR, stdio: 'inherit' });

  const pool = createPool(getDatabaseUrl());
  try {
    const db = createDb(pool);
    const local = await readLocalSites();
    for (const user of TEST_USERS) await upsertUser(db, user);
    for (const site of FIXTURES) {
      if (await siteExists(db, site)) continue;
      const lines = withLocalDomains(await readFixture(site), local);
      const result = await importSnapshot(db, { ...SYSTEM_ACTOR }, lines);
      if (!result.ok) throw new Error(`Seed de ${site}: ${JSON.stringify(result.issues)}`);
    }
  } finally {
    await pool.end();
  }
}
