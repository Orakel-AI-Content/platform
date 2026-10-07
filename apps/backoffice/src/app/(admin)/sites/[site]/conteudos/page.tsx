import Link from 'next/link';

import { ContentsTable } from '@/components/contents-table';
import { can } from '@/domain/access/rbac.ts';
import { listContents } from '@/domain/content/contents.ts';
import { noRead } from '@/components/forbidden-screen';

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
  const { actor, db, site } = context.value;
  const contents = await listContents(db, actor, siteId);
  if (!contents.ok) return noRead;

  return (
    <section aria-labelledby="contents-title" className="space-y-4">
      <p className="text-sm">
        <Link href={`/sites/${site.id}`} className="underline underline-offset-4">
          {site.name}
        </Link>
      </p>
      <h1 id="contents-title" className="text-2xl font-semibold">
        Conteúdos <span className="text-muted-foreground">({site.id})</span>
      </h1>
      <ContentsTable
        siteId={site.id}
        rows={contents.value}
        canWrite={can(actor, 'content.write')}
      />
    </section>
  );
}
