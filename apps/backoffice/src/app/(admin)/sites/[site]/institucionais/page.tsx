import { InstitutionalTextsForm } from '@/components/editorial/EntityForms';
import { getInstitutionalTexts } from '@/domain/sites/sites.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';

import { updateInstitutionalTextsAction } from '../editorial-actions.ts';
import { noWrite, sitePageContext } from '../editorial-page.tsx';

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
    <section aria-labelledby="institutional-title" className="space-y-4">
      {/* A largura fica na coluna do formulário: a barra de ações encosta nas bordas do main. */}
      <div className="form-width space-y-4">
        <PageHeader
          id="institutional-title"
          trail={siteTrail(site, 'Textos institucionais')}
          title="Textos institucionais"
        />
      </div>
      <InstitutionalTextsForm
        defaultValues={texts.value}
        backHref={`/sites/${site.id}`}
        contentClassName="form-width"
        action={updateInstitutionalTextsAction.bind(null, site.id)}
      />
    </section>
  );
}
