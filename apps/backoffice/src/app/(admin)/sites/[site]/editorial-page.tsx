import type { Result } from '@orakel/content-model';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import { backToSite, ForbiddenScreen, noRead } from '@/components/forbidden-screen';
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
  | {
      kind: 'found';
      actor: Actor;
      site: SiteSummary;
      /** Todos os sites que quem pede pode ver (`listSites`): o seletor de site (#172). */
      sites: SiteSummary[];
    }
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
    : { kind: 'found', actor: actor.value, site, sites: sites.value };
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
    return { ok: false, render: noRead };
  }
  if (lookup.kind === 'missing') notFound();
  const { actor, site } = lookup;
  return {
    ok: true,
    value: { actor, db: getDb().db, site, canWrite: can(actor, 'content.write') },
  };
}

/** Tela de permissão sem `content.write`, com a volta para o site. */
export function noWrite(siteId: string): ReactNode {
  return <ForbiddenScreen action="content.write" back={backToSite(siteId)} />;
}

/** Item da trilha: com `href`, é link; sem, é a tela atual (o último). */
export type TrailItem = { label: string; href?: string };

/** Trilha das telas de um site (#173): `Sites › <nome> [› <área>]`. */
export function siteTrail(site: { id: string; name: string }, area?: string): TrailItem[] {
  const sites = { label: 'Sites', href: '/sites' };
  if (area === undefined) return [sites, { label: site.name }];
  return [sites, { label: site.name, href: `/sites/${site.id}` }, { label: area }];
}

/** Trilha de navegação acima do título: links até a tela atual, que leva `aria-current`. */
function Trail({ items }: { items: readonly TrailItem[] }) {
  return (
    <nav aria-label="Trilha de navegação">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
            )}
            {item.href === undefined ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <Link href={item.href} className="underline underline-offset-4">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Cabeçalho da tela (#87): trilha (#173) ou link de volta (telas de item, até a #174),
 * título à esquerda e a ação principal à direita. A página só passa `action` quando quem
 * pede tem permissão para ela.
 */
export function PageHeader({
  id,
  trail,
  back,
  title,
  action,
}: {
  id: string;
  /** Caminho até a tela, do mais geral ao atual (`siteTrail`). */
  trail?: readonly TrailItem[];
  back?: { href: string; label: string };
  title: ReactNode;
  /** Ação principal (e as secundárias, agrupadas): link de criar, de cadastrar. */
  action?: ReactNode;
}) {
  const heading = (
    <h1 id={id} className="text-2xl font-semibold">
      {title}
    </h1>
  );
  return (
    <>
      {trail && <Trail items={trail} />}
      {back && (
        <p className="text-sm">
          <Link href={back.href} className="underline underline-offset-4">
            {back.label}
          </Link>
        </p>
      )}
      {action ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {heading}
          <div className="flex flex-wrap items-center gap-2">{action}</div>
        </div>
      ) : (
        heading
      )}
    </>
  );
}

/** Valores do formulário de edição: a entidade sem o ID (que é da URL). */
export function withoutId<T extends { id: number }>(item: T): Omit<T, 'id'> {
  const copy: Partial<T> = { ...item };
  delete copy.id;
  return copy as Omit<T, 'id'>;
}
