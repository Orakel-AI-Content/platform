import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentActor } from '@/auth/request-actor.ts';
import { ContentsTable } from '@/components/contents-table';
import { getDb } from '@/db/client.ts';
import { can } from '@/domain/access/rbac.ts';
import { listContents } from '@/domain/content/contents.ts';
import { listSites } from '@/domain/sites/sites.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Conteúdos · Orakel Backoffice' };

/**
 * Conteúdos do site com a versão mais recente de cada um. Ler exige site.read (o domínio
 * confere); criar e editar só aparecem com content.write.
 */
export default async function ContentsPage({ params }: { params: Promise<{ site: string }> }) {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const { site: siteId } = await params;
  const db = getDb().db;
  const sites = await listSites(db, actor.value);
  if (!sites.ok) return <p role="alert">Sem permissão para ver os sites.</p>;
  const site = sites.value.find((summary) => summary.id === siteId);
  if (site === undefined) notFound();
  const contents = await listContents(db, actor.value, siteId);
  if (!contents.ok) return <p role="alert">Sem permissão para ver os conteúdos.</p>;

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
        canWrite={can(actor.value, 'content.write')}
      />
    </section>
  );
}
