import { RESOURCES } from '@orakel/content-model/v1';
import { THEME_SUMMARIES } from '@orakel/tokens';

import { currentActor } from '@/auth/request-actor.ts';
import { backToSites, ForbiddenScreen } from '@/components/shared/ForbiddenScreen';
import { emptySiteConfig } from '@/components/site-config-form-values.ts';
import { SiteConfigForm } from '@/components/site-config-form';
import { can } from '@/domain/access/rbac.ts';

import { PageHeader } from '../[site]/editorial-page.tsx';
import { createSiteAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Cadastrar site' };

/** Cadastro de site: a tela só mostra; permissão e regras são do domínio (createSite). */
export default async function NewSitePage() {
  const actor = await currentActor();
  if (!actor.ok) return null;
  if (!can(actor.value, 'site.configure')) {
    return <ForbiddenScreen action="site.configure" back={backToSites} />;
  }
  return (
    <section aria-labelledby="new-site-title" className="form-width space-y-6">
      <PageHeader
        id="new-site-title"
        trail={[{ label: 'Sites', href: '/sites' }, { label: 'Cadastrar site' }]}
        title="Cadastrar site"
      />
      <SiteConfigForm
        mode="create"
        defaultValues={emptySiteConfig(RESOURCES)}
        options={{
          presets: RESOURCES.presets,
          variants: RESOURCES.variants,
          themes: THEME_SUMMARIES,
        }}
        action={createSiteAction}
      />
    </section>
  );
}
