import { RESOURCES } from '@orakel/content-model/v1';
import { THEME_SUMMARIES } from '@orakel/tokens';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { backToSite, ForbiddenScreen } from '@/components/forbidden-screen';
import { editValues } from '@/components/site-config-form-values.ts';
import { SiteConfigForm } from '@/components/site-config-form';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { currentConfig } from '@/domain/sites/sites.ts';

import { updateSiteConfigAction } from '../../actions.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Configuração do site' };

/**
 * Edição da configuração corrente: grava uma versão nova pelo domínio (updateSiteConfig).
 * Os textos institucionais não passam pelo formulário; o domínio os preserva.
 */
export default async function SiteConfigPage({ params }: { params: Promise<{ site: string }> }) {
  const actor = await currentActor();
  const { site } = await params;
  if (!actor.ok) return null;
  if (!can(actor.value, 'site.configure')) {
    return <ForbiddenScreen action="site.configure" back={backToSite(site)} />;
  }
  const config = await currentConfig(getDb().db, site);
  if (config === undefined) notFound();
  return (
    <section aria-labelledby="site-config-title" className="form-width space-y-6">
      <h1 id="site-config-title" className="text-2xl font-semibold">
        Configuração de {config.name} <span className="text-muted-foreground">({site})</span>
      </h1>
      <SiteConfigForm
        mode="edit"
        defaultValues={editValues(config)}
        options={{
          presets: RESOURCES.presets,
          variants: RESOURCES.variants,
          themes: THEME_SUMMARIES,
        }}
        action={updateSiteConfigAction.bind(null, site)}
      />
    </section>
  );
}
