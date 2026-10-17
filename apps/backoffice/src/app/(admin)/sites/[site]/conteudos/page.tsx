import Link from 'next/link';

import { ContentsTable } from '@/components/contents-table';
import { listContents } from '@/domain/content/contents.ts';
import { noRead } from '@/components/forbidden-screen';
import { Button } from '@/components/ui/Button';

import { PageHeader, siteTrail, sitePageContext } from '../editorial-page.tsx';

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
    <Button asElement={Link} href={`/sites/${site.id}/conteudos/novo`} variant="solid" size="sm">
      Criar conteúdo
    </Button>
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
