import { RESOURCES } from '@orakel/content-model/v1';

import { currentActor } from '@/auth/request-actor.ts';
import { backToSites, ForbiddenScreen } from '@/components/forbidden-screen';
import { emptySiteConfig } from '@/components/site-config-form-values.ts';
import { SiteConfigForm } from '@/components/site-config-form';
import { can } from '@/domain/access/rbac.ts';

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
    <section aria-labelledby="new-site-title" className="space-y-6">
      <h1 id="new-site-title" className="text-2xl font-semibold">
        Cadastrar site
      </h1>
      <SiteConfigForm
        mode="create"
        defaultValues={emptySiteConfig(RESOURCES)}
        options={{ presets: RESOURCES.presets, variants: RESOURCES.variants }}
        action={createSiteAction}
      />
    </section>
  );
}
