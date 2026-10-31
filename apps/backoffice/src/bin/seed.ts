import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSnapshotLine, type SnapshotLine } from '@orakel/content-model/v1';

import { getDb } from '../db/client.ts';
import { SYSTEM_ACTOR } from '../domain/access/rbac.ts';
import { upsertUser } from '../domain/access/users.ts';
import { importSnapshot } from '../domain/import/import-snapshot.ts';
import {
  listSiteSeeds,
  processSeedMedia,
  readSiteSeed,
  siteSeedLines,
  storeMediaPlaceholders,
} from '../domain/import/site-seed.ts';
import { siteExists } from '../domain/sites/sites.ts';
import { getEnv } from '../env.ts';
import { createS3Client, s3ObjectStore } from '../lib/s3.ts';
import { runProcess } from './run-process.ts';

/** Um usuário de teste por papel: os mesmos e-mails do access-mock. */
export const TEST_USERS = [
  { email: 'admin@orakel.local', name: 'Admin de teste', roles: ['admin'] },
  { email: 'editor@orakel.local', name: 'Editor de teste', roles: ['editor'] },
  { email: 'revisor@orakel.local', name: 'Revisor de teste', roles: ['revisor'] },
  { email: 'operacao@orakel.local', name: 'Operação de teste', roles: ['operacao'] },
] as const;

const FIXTURES = ['exemplo-a', 'exemplo-b'];

/**
 * Só o que é local nos sites (ADR 0015 da raiz): domínios <site>.localhost, para canonical,
 * mídia e wrangler.jsonc apontarem para o ambiente local. Sem o arquivo, a configuração
 * entra como está. A mesma pasta guarda os sites completos (`<site>/site.json`).
 */
const LOCAL_SEEDS_DIR =
  process.env.LOCAL_SEEDS_DIR ??
  fileURLToPath(new URL('../../../../infra/local/seeds/', import.meta.url));

type LocalSites = Record<string, { domains?: string[] }>;

export async function readLocalSites(dir = LOCAL_SEEDS_DIR): Promise<LocalSites> {
  const text = await readFile(join(dir, 'sites.json'), 'utf8').catch(() => undefined);
  return text === undefined ? {} : (JSON.parse(text) as LocalSites);
}

/** Aplica os domínios locais na linha de configuração do snapshot. */
export function withLocalDomains(lines: SnapshotLine[], local: LocalSites): SnapshotLine[] {
  return lines.map((line) => {
    if (line.type !== 'config') return line;
    const domains = local[line.data.siteId]?.domains;
    return domains?.length ? { ...line, data: { ...line.data, domains } } : line;
  });
}

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

/** Erro do armazenamento com a pista do bucket que costuma faltar. */
function bucketHint(site: string) {
  return (error: unknown): never => {
    throw new Error(
      `Imagens de ${site}: confira se o site está em infra/local/seeds/sites.json e rode pnpm local:up`,
      { cause: error },
    );
  };
}

// Dados do ambiente local: usuários de teste, os dois sites das fixtures (os E2E dependem
// deles) e os sites completos de infra/local/seeds/<site>/, com imagens de verdade.
// Idempotente: site que já existe não é importado de novo, mas as imagens dele são gravadas
// de novo no bucket quando faltam (o S3 pode ter sido recriado sem o banco).
if (import.meta.main) {
  await runProcess('backoffice-seed', async (logger) => {
    const { pool, db } = getDb();
    const local = await readLocalSites();
    const store = s3ObjectStore(createS3Client(getEnv()));
    for (const user of TEST_USERS) await upsertUser(db, user);
    for (const site of FIXTURES) {
      const lines = withLocalDomains(await readFixture(site), local);
      // As fixtures não trazem imagem: uma lisa por variante, para o site não ficar sem.
      const placeholders = await storeMediaPlaceholders(store, site, lines).catch(bucketHint(site));
      if (await siteExists(db, site)) {
        logger.info({ siteId: site, placeholders }, 'site já existe; pulado');
        continue;
      }
      const result = await importSnapshot(db, { ...SYSTEM_ACTOR }, lines);
      if (!result.ok) throw new Error(`Seed de ${site}: ${JSON.stringify(result.issues)}`);
      logger.info({ siteId: site, placeholders }, 'site importado');
    }
    for (const dir of await listSiteSeeds(LOCAL_SEEDS_DIR)) {
      const seed = await readSiteSeed(dir);
      const site = seed.config.siteId;
      // O bucket media-<site> é criado pelo s3-init a partir do sites.json (ADR 0013). As
      // variantes que já existem são mantidas: repetir só grava as que faltam.
      const media = await processSeedMedia(store, dir, seed).catch(bucketHint(site));
      if (await siteExists(db, site)) {
        logger.info({ siteId: site, media: media.lines.length }, 'site já existe; pulado');
        continue;
      }
      const lines = withLocalDomains(siteSeedLines(seed, media.lines), local);
      const result = await importSnapshot(db, { ...SYSTEM_ACTOR }, lines, {
        mediaOrigins: media.origins,
      });
      if (!result.ok) throw new Error(`Seed de ${site}: ${JSON.stringify(result.issues)}`);
      logger.info({ siteId: site, media: media.lines.length }, 'site importado');
    }
    await pool.end();
  });
}
