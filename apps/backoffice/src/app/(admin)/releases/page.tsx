import { currentActor } from '@/auth/request-actor.ts';
import { NewReleaseDialog } from '@/components/releases/NewReleaseDialog';
import { ReleasesTable } from '@/components/releases/ReleasesTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { backToSites, ForbiddenScreen } from '@/components/shared/ForbiddenScreen';
import { ListHeader } from '@/components/shared/PageHeader';
import { getDb } from '@/db/client.ts';
import { nextVersion } from '@/domain/releases/next-version.ts';

import {
  discardReleaseAction,
  releasesStatusAction,
  requestNewReleaseAction,
  retryReleaseAction,
} from './actions.ts';
import { loadReleasesSnapshot } from './snapshot.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Releases' };

/**
 * Registro de versões do site-builder (#509), só para quem promove release (admin e operação): tag,
 * data de registro e estado do pipeline ao vivo, com "Tentar de novo" e "Descartar" (#665), e
 * "Gerar nova versão" (#664), com o próximo número de cada tipo calculado aqui sobre as tags
 * listadas (todas, as descartadas inclusive). Lista no padrão do template, como `/sites`: título, ação, toolbar e
 * tabela no cartão.
 */
export default async function ReleasesPage() {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const snapshot = await loadReleasesSnapshot(getDb().db, actor.value);
  if (!snapshot.ok) {
    return <ForbiddenScreen action="release.promote" back={backToSites} />;
  }
  const tags = snapshot.value.rows.map((release) => release.tag);
  const generate = (
    <NewReleaseDialog
      proposals={{
        patch: nextVersion(tags, 'patch'),
        minor: nextVersion(tags, 'minor'),
        major: nextVersion(tags, 'major'),
      }}
      action={requestNewReleaseAction}
    />
  );
  return (
    <section aria-labelledby="releases-title" className="list-width space-y-4">
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="releases-title" title="Releases" action={generate} />
          <ReleasesTable
            rows={snapshot.value.rows}
            inUse={snapshot.value.inUse}
            retry={retryReleaseAction}
            discard={discardReleaseAction}
            status={releasesStatusAction}
            emptyAction={generate}
            labelledBy="releases-title"
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
