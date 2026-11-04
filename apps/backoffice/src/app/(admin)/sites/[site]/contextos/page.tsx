import { TbPlus } from 'react-icons/tb';

import { EditorialContextsTable } from '@/components/generation/EditorialContextsTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { ListHeader, PageTrail } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { listEditorialContexts } from '@/domain/generation/editorial-contexts.ts';

import { sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Contextos editoriais' };

/**
 * Versões do contexto editorial do site (RN-GEN-05), da mais recente para a primeira. Ler
 * exige site.read e criar, content.write (o domínio confere). Lista no padrão do template
 * (#365): a trilha acima do cartão; título, ação, toolbar e tabela dentro dele.
 */
export default async function EditorialContextsPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const versions = await listEditorialContexts(db, actor, site.id);
  if (!versions.ok) return noRead;

  const create = canWrite ? (
    <ButtonLink
      href={`/sites/${site.id}/contextos/nova`}
      variant="solid"
      icon={<TbPlus className="text-xl" aria-hidden />}
    >
      Nova versão
    </ButtonLink>
  ) : undefined;

  return (
    <section aria-labelledby="editorial-contexts-title" className="list-width space-y-4">
      <PageTrail items={siteTrail(site, 'Contextos editoriais')} />
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="editorial-contexts-title" title="Contextos editoriais" action={create} />
          <EditorialContextsTable
            timeZone={site.timeZone}
            rows={versions.value}
            labelledBy="editorial-contexts-title"
            emptyAction={create}
          />
        </div>
      </AdaptiveCard>
    </section>
  );
}
