import type { Result } from '@orakel/content-model';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import { getDb, type Executor } from '@/db/client.ts';
import { can, type Actor } from '@/domain/access/rbac.ts';
import { listAuthors } from '@/domain/content/authors.ts';
import { listMenus } from '@/domain/content/menus.ts';
import { listTaxonomies } from '@/domain/content/taxonomies.ts';
import { listSites, type SiteSummary } from '@/domain/sites/sites.ts';

// Base das telas do site (#46, #78): sessão, site existente (404) e permissão de gravar
// decidida no servidor; o domínio confere de novo.

export type SitePageContext = {
  actor: Actor;
  db: Executor;
  site: SiteSummary;
  canWrite: boolean;
};

/** O site da URL e quem pede, ou por que não há site (sem sessão, sem `site.read`, inexistente). */
export type SiteLookup =
  | { kind: 'found'; actor: Actor; site: SiteSummary }
  | { kind: 'missing'; actor: Actor }
  | { kind: 'forbidden'; actor: Actor }
  | { kind: 'no-session' };

/**
 * Busca do site, uma vez por requisição: o layout do site, o `generateMetadata` e a página
 * compartilham o resultado (`cache` do React, como o `currentActor`).
 */
export const lookupSite = cache(async (siteId: string): Promise<SiteLookup> => {
  const actor = await currentActor();
  if (!actor.ok) return { kind: 'no-session' };
  const sites = await listSites(getDb().db, actor.value);
  if (!sites.ok) return { kind: 'forbidden', actor: actor.value };
  const site = sites.value.find((summary) => summary.id === siteId);
  return site === undefined
    ? { kind: 'missing', actor: actor.value }
    : { kind: 'found', actor: actor.value, site };
});

/**
 * Uma lista do site lida uma vez por requisição: o título da aba (`generateMetadata`) e a
 * página de edição compartilham o resultado (#79). `undefined` quando não há site para ler.
 */
function siteList<T>(list: (db: Executor, actor: Actor, siteId: string) => Promise<Result<T[]>>) {
  return cache(async (siteId: string): Promise<Result<T[]> | undefined> => {
    const lookup = await lookupSite(siteId);
    if (lookup.kind !== 'found') return undefined;
    return list(getDb().db, lookup.actor, siteId);
  });
}

export const readAuthors = siteList(listAuthors);
export const readTaxonomies = siteList(listTaxonomies);
export const readMenus = siteList(listMenus);

/** Contexto da página, ou o que mostrar no lugar dela (sem sessão, sem permissão). */
export async function sitePageContext(
  siteId: string,
): Promise<{ ok: true; value: SitePageContext } | { ok: false; render: ReactNode }> {
  const lookup = await lookupSite(siteId);
  if (lookup.kind === 'no-session') return { ok: false, render: null };
  if (lookup.kind === 'forbidden') {
    return { ok: false, render: <p role="alert">Sem permissão para ver os sites.</p> };
  }
  if (lookup.kind === 'missing') notFound();
  const { actor, site } = lookup;
  return {
    ok: true,
    value: { actor, db: getDb().db, site, canWrite: can(actor, 'content.write') },
  };
}

export const noWrite = <p role="alert">Sem permissão para editar o conteúdo deste site.</p>;

/** Título da tela com o link de volta. */
export function PageHeader({
  id,
  back,
  title,
}: {
  id: string;
  back: { href: string; label: string };
  title: ReactNode;
}) {
  return (
    <>
      <p className="text-sm">
        <Link href={back.href} className="underline underline-offset-4">
          {back.label}
        </Link>
      </p>
      <h1 id={id} className="text-2xl font-semibold">
        {title}
      </h1>
    </>
  );
}

/** Valores do formulário de edição: a entidade sem o ID (que é da URL). */
export function withoutId<T extends { id: number }>(item: T): Omit<T, 'id'> {
  const copy: Partial<T> = { ...item };
  delete copy.id;
  return copy as Omit<T, 'id'>;
}
