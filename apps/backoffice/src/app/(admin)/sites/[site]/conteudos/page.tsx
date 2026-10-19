import { ContentsTable } from '@/components/contents/ContentsTable';
import { listContents } from '@/domain/content/contents.ts';
import { noRead } from '@/components/shared/ForbiddenScreen';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { PageHeader } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';

import { sitePageContext } from '../editorial-page.tsx';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Conteúdos' };

/**
 * Conteúdos do site com a versão mais recente de cada um. Ler exige site.read (o domínio
 * confere); criar e editar só aparecem com content.write.
 */
export default async function ContentsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteId } = await params;
  const context = await sitePageContext(siteId);
  if (!context.ok) return context.render;
  const { actor, db, site, canWrite } = context.value;
  const contents = await listContents(db, actor, siteId);
  if (!contents.ok) return noRead;

  const create = canWrite ? (
    <ButtonLink href={`/sites/${site.id}/conteudos/novo`} variant="solid" size="sm">
      Criar conteúdo
    </ButtonLink>
  ) : undefined;

  return (
    <section aria-labelledby="contents-title" className="list-width space-y-4">
      <PageHeader
        id="contents-title"
        trail={siteTrail(site, 'Conteúdos')}
        title="Conteúdos"
        action={create}
      />
      <ContentsTable
        siteId={site.id}
        timeZone={site.timeZone}
        rows={contents.value}
        canWrite={canWrite}
        emptyAction={create}
      />
    </section>
  );
}
