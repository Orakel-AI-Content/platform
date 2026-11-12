import { currentActor } from '@/auth/request-actor.ts';
import { NewReleaseDialog } from '@/components/releases/NewReleaseDialog';
import { ReleasesTable } from '@/components/releases/ReleasesTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { backToSites, ForbiddenScreen } from '@/components/shared/ForbiddenScreen';
import { ListHeader } from '@/components/shared/PageHeader';
import { getDb } from '@/db/client.ts';
import { nextVersion } from '@/domain/releases/next-version.ts';
import { listReleases } from '@/domain/releases/releases.ts';

import { recheckReleaseImageAction, requestNewReleaseAction } from './actions.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Releases' };

/**
 * Registro de versões do site-builder (#509), só para quem promove release (admin e operação): tag,
 * data de registro e estado da imagem no host com "Reconferir" (#574), e "Gerar nova versão"
 * (#664), com o próximo número de cada tipo calculado aqui sobre as tags listadas (todas, as
 * descartadas inclusive). Lista no padrão do template, como `/sites`: título, ação, toolbar e
 * tabela no cartão.
 */
export default async function ReleasesPage() {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const releases = await listReleases(getDb().db, actor.value);
  if (!releases.ok) {
    return <ForbiddenScreen action="release.promote" back={backToSites} />;
  }
  const tags = releases.value.map((release) => release.tag);
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
            rows={releases.value}
            recheck={recheckReleaseImageAction}
            emptyAction={generate}
            labelledBy="releases-title"
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
