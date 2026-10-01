// Versões em disco (ADR 0003 da unidade):
//
//   <data>/sites/<site>/versions/<id>/{site/, worker/index.js, wrangler.jsonc}
//   <data>/sites/<site>/active          ID ativo, gravado de forma atômica
//
// ID: <UTC compacto>-<8 hex do sha256 do tar.gz>. O conteúdo extraído fica sem escrita; a
// pasta da versão continua gravável para o .wrangler/ do runtime.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { ARCHIVE_LAYOUT } from '@orakel/build-contract';

const run = promisify(execFile);
const SITE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d{8}T\d{6}Z-[0-9a-f]{8}$/;

export class StoreError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
  }
}

export type VersionInfo = { id: string; createdAt: string; files: number; active: boolean };

export function versionId(now: Date, archive: Uint8Array): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const hash = createHash('sha256').update(archive).digest('hex').slice(0, 8);
  return `${stamp}-${hash}`;
}

/** `20260930T153012Z-…` → ISO. */
export function createdAtOf(id: string): string {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(id) ?? [];
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

export function assertSite(site: string): void {
  if (!SITE.test(site)) throw new StoreError(`Site inválido: ${site}`, 400);
}

async function countFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

export class Store {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  siteDir(site: string) {
    return join(this.root, 'sites', site);
  }

  versionDir(site: string, id: string) {
    return join(this.siteDir(site), 'versions', id);
  }

  configPath(site: string, id: string) {
    return join(this.versionDir(site, id), ARCHIVE_LAYOUT.config);
  }

  /** Extrai e valida o tar.gz do publish; devolve o ID da versão nova. */
  async add(site: string, archive: Uint8Array, now = new Date()): Promise<string> {
    assertSite(site);
    // IDs sempre crescentes na ordem de publicação, mesmo com duas no mesmo segundo: a
    // ordem dos IDs é a que o rollback usa para achar a anterior.
    const [newest] = await this.ids(site);
    const floor = newest === undefined ? 0 : Date.parse(createdAtOf(newest)) + 1000;
    const id = versionId(new Date(Math.max(now.getTime(), floor)), archive);
    const dir = this.versionDir(site, id);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const file = join(dir, '.upload.tar.gz');
    try {
      await writeFile(file, archive);
      await run('tar', ['-xzf', file, '-C', dir]).catch(() => {
        throw new StoreError('Arquivo inválido: não é um tar.gz', 400);
      });
      await rm(file);
      await this.validate(site, dir);
      for (const part of [ARCHIVE_LAYOUT.site, 'worker', ARCHIVE_LAYOUT.config]) {
        await run('chmod', ['-R', 'a-w', join(dir, part)]);
      }
      return id;
    } catch (error) {
      await run('chmod', ['-R', 'u+w', dir]).catch(() => undefined);
      await rm(dir, { recursive: true, force: true });
      throw error;
    }
  }

  private async validate(site: string, dir: string) {
    const missing = [ARCHIVE_LAYOUT.site, ARCHIVE_LAYOUT.worker, ARCHIVE_LAYOUT.config];
    for (const part of missing) {
      if (!(await stat(join(dir, part)).catch(() => undefined))) {
        throw new StoreError(`Arquivo sem ${part}`, 400);
      }
    }
    let config: { name?: unknown };
    try {
      config = JSON.parse(await readFile(join(dir, ARCHIVE_LAYOUT.config), 'utf8')) as {
        name?: unknown;
      };
    } catch {
      throw new StoreError(`${ARCHIVE_LAYOUT.config} não é JSON`, 400);
    }
    if (config.name !== `orakel-${site}`) {
      throw new StoreError(
        `${ARCHIVE_LAYOUT.config} é de outro Worker: ${String(config.name)}`,
        400,
      );
    }
  }

  async active(site: string): Promise<string | undefined> {
    const id = (await readFile(join(this.siteDir(site), 'active'), 'utf8').catch(() => '')).trim();
    return id || undefined;
  }

  async setActive(site: string, id: string): Promise<void> {
    const file = join(this.siteDir(site), 'active');
    await writeFile(`${file}.tmp`, `${id}\n`);
    await rename(`${file}.tmp`, file);
  }

  async ids(site: string): Promise<string[]> {
    const names = await readdir(join(this.siteDir(site), 'versions')).catch(() => [] as string[]);
    return names
      .filter((name) => VERSION.test(name))
      .sort()
      .reverse();
  }

  async list(site: string): Promise<{ active: string | null; versions: VersionInfo[] }> {
    assertSite(site);
    const active = await this.active(site);
    const versions = await Promise.all(
      (await this.ids(site)).map(async (id) => ({
        id,
        createdAt: createdAtOf(id),
        files: await countFiles(join(this.versionDir(site, id), ARCHIVE_LAYOUT.site)),
        active: id === active,
      })),
    );
    return { active: active ?? null, versions };
  }

  async sites(): Promise<string[]> {
    const names = await readdir(join(this.root, 'sites')).catch(() => [] as string[]);
    return names.filter((name) => SITE.test(name)).sort();
  }

  async remove(site: string, id: string): Promise<void> {
    const dir = this.versionDir(site, id);
    await run('chmod', ['-R', 'u+w', dir]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }

  /** Mantém as `keep` mais novas e a ativa; devolve as apagadas. */
  async prune(site: string, keep: number): Promise<string[]> {
    const active = await this.active(site);
    const removed = (await this.ids(site)).slice(keep).filter((id) => id !== active);
    for (const id of removed) await this.remove(site, id);
    return removed;
  }

  /** Versão para o rollback: a pedida, ou a anterior à ativa. */
  async rollbackTarget(site: string, id?: string): Promise<string> {
    assertSite(site);
    const ids = await this.ids(site);
    if (id !== undefined) {
      if (!ids.includes(id)) throw new StoreError(`Versão ${id} não existe`, 404);
      return id;
    }
    const active = await this.active(site);
    const index = active === undefined ? -1 : ids.indexOf(active);
    const previous = index === -1 ? undefined : ids[index + 1];
    if (!previous) throw new StoreError('Não há versão anterior para voltar', 404);
    return previous;
  }
}
