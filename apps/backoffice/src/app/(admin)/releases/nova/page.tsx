import { currentActor } from '@/auth/request-actor.ts';
import { RELEASES_HREF, ReleaseForm } from '@/components/releases/ReleaseForm';
import { backToSites, ForbiddenScreen } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { can } from '@/domain/access/rbac.ts';

import { registerReleaseAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Registrar release' };

/** Cadastro de release: a tela só mostra; permissão e regras são do domínio (registerRelease). */
export default async function NewReleasePage() {
  const actor = await currentActor();
  if (!actor.ok) return null;
  if (!can(actor.value, 'release.promote')) {
    return <ForbiddenScreen action="release.promote" back={backToSites} />;
  }
  return (
    <section aria-labelledby="new-release-title" className="space-y-4">
      <div className="form-width space-y-4">
        <PageHeader
          id="new-release-title"
          trail={[{ label: 'Releases', href: RELEASES_HREF }, { label: 'Registrar release' }]}
          title="Registrar release"
        />
      </div>
      <ReleaseForm action={registerReleaseAction} contentClassName="form-width" />
    </section>
  );
}
