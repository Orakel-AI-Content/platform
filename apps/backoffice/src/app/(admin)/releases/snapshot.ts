import type { Result } from '@orakel/content-model';

import type { ReleasesSnapshot } from '@/components/releases/ReleasesTable.tsx';
import type { Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { readPreviewState } from '@/domain/preview/preview.ts';
import { latestAvailableRelease, listReleases } from '@/domain/releases/releases.ts';
import { latestRollout } from '@/domain/releases/rollout.ts';
import { listSites } from '@/domain/sites/sites.ts';

/**
 * O que a lista de Releases mostra, lido pela página e pelo polling (`releasesStatusAction`): as
 * releases, as tags que algum site usa (`sites.release`), que escondem o "Descartar", o estado
 * da prévia (#710), a última atualização de todos os sites e a versão que uma nova levaria
 * (#703). Recusa de permissão vem de `listReleases` (todo papel com `release.promote` tem
 * `site.read`); a prévia e o destino, que não checam permissão, só são lidos depois dela.
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
  const rollout = await latestRollout(db, actor);
  if (!rollout.ok) return rollout;
  const preview = await readPreviewState(db);
  const rolloutTarget = await latestAvailableRelease(db);
  return {
    ok: true,
    value: {
      rows: releases.value,
      inUse: [...inUse],
      preview,
      rollout: rollout.value,
      rolloutTarget,
    },
  };
}
