import type { Result } from '@orakel/content-model';

import type { ReleasesSnapshot } from '@/components/releases/ReleasesTable.tsx';
import type { Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { listReleases } from '@/domain/releases/releases.ts';
import { listSites } from '@/domain/sites/sites.ts';

/**
 * O que a lista de Releases mostra, lido pela página e pelo polling (`releasesStatusAction`): as
 * releases e as tags que algum site usa (`sites.release`), que escondem o "Descartar". Recusa
 * de permissão vem de `listReleases` (todo papel com `release.promote` tem `site.read`).
 */
export async function loadReleasesSnapshot(
  db: Executor,
  actor: Actor,
): Promise<Result<ReleasesSnapshot>> {
  const releases = await listReleases(db, actor);
  if (!releases.ok) return releases;
  const sites = await listSites(db, actor);
  if (!sites.ok) return sites;
  const inUse = new Set(
    sites.value.flatMap((site) => (site.release === null ? [] : [site.release])),
  );
  return { ok: true, value: { rows: releases.value, inUse: [...inUse] } };
}
