import { RESOURCES } from '@orakel/content-model/v1';
import { THEME_SUMMARIES } from '@orakel/tokens';

import { currentActor } from '@/auth/request-actor.ts';
import { backToSites, ForbiddenScreen } from '@/components/shared/ForbiddenScreen';
import { emptySiteConfig } from '@/components/sites/siteConfigFormValues.ts';
import { SiteConfigForm } from '@/components/sites/SiteConfigForm';
import { can } from '@/domain/access/rbac.ts';
import { PageHeader } from '@/components/shared/PageHeader';
import { sitesTrail } from '@/components/shared/trail.ts';

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
    <section aria-labelledby="new-site-title" className="space-y-4">
      {/* A largura fica na coluna do formulário: a barra de ações encosta nas bordas do main. */}
      <div className="form-width space-y-4">
        <PageHeader
          id="new-site-title"
          trail={sitesTrail([{ label: 'Cadastrar site' }])}
          title="Cadastrar site"
        />
      </div>
      <SiteConfigForm
        mode="create"
        defaultValues={emptySiteConfig(RESOURCES)}
        options={{
          presets: RESOURCES.presets,
          variants: RESOURCES.variants,
          themes: THEME_SUMMARIES,
        }}
        backHref={backToSites.href}
        contentClassName="form-width"
        action={createSiteAction}
      />
    </section>
  );
}
