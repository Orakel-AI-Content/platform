import { TbPlus } from 'react-icons/tb';

import { currentActor } from '@/auth/request-actor.ts';
import { ReleasesTable } from '@/components/releases/ReleasesTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { backToSites, ForbiddenScreen } from '@/components/shared/ForbiddenScreen';
import { ListHeader } from '@/components/shared/PageHeader';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { getDb } from '@/db/client.ts';
import { listReleases } from '@/domain/releases/releases.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Releases' };

type SearchParams = { searchParams: Promise<{ registrada?: string | string[] }> };

/**
 * Registro de releases do core (#509), só para quem promove release (admin e operação): tag e
 * data de registro, com "Registrar release". `?registrada=<tag>` vem do cadastro. Lista no
 * padrão do template, como `/sites`: título, ação, toolbar e tabela no cartão.
 */
export default async function ReleasesPage({ searchParams }: SearchParams) {
  const { registrada } = await searchParams;
  const actor = await currentActor();
  if (!actor.ok) return null;
  const releases = await listReleases(getDb().db, actor.value);
  if (!releases.ok) {
    return <ForbiddenScreen action="release.promote" back={backToSites} />;
  }
  const register = (
    <ButtonLink
      href="/releases/nova"
      variant="solid"
      icon={<TbPlus className="text-xl" aria-hidden />}
    >
      Registrar release
    </ButtonLink>
  );
  return (
    <section aria-labelledby="releases-title" className="list-width space-y-4">
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="releases-title" title="Releases" action={register} />
          <ReleasesTable
            rows={releases.value}
            emptyAction={register}
            created={typeof registrada === 'string' ? registrada : undefined}
            labelledBy="releases-title"
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
