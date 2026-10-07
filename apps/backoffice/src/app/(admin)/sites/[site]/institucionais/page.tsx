import { InstitutionalTextsForm } from '@/components/entity-forms';
import { getInstitutionalTexts } from '@/domain/sites/sites.ts';

import { updateInstitutionalTextsAction } from '../editorial-actions.ts';
import { noRead, noWrite, PageHeader, sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Textos institucionais' };

/**
 * Textos institucionais do site (sobre, contato, termos, privacidade, política editorial).
 * Salvar grava a versão nova da configuração com o restante intacto (domínio).
 */
export default async function InstitutionalTextsPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  if (!canWrite) return noWrite(site.id);
  const texts = await getInstitutionalTexts(db, actor, site.id);
  if (!texts.ok) return noRead;

  return (
    <section aria-labelledby="institutional-title" className="max-w-3xl space-y-4">
      <PageHeader
        id="institutional-title"
        back={{ href: `/sites/${site.id}`, label: site.name }}
        title={`Textos institucionais (${site.id})`}
      />
      <InstitutionalTextsForm
        defaultValues={texts.value}
        action={updateInstitutionalTextsAction.bind(null, site.id)}
      />
    </section>
  );
}
