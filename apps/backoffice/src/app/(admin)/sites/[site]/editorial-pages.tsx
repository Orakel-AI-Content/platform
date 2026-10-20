import type { Result } from '@orakel/content-model';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import {
  ENTITY_CONFIG,
  type EntityItems,
  type EntityKind,
} from '@/components/editorial/entityConfig.ts';
import { EntityForm, type EntityFormResult } from '@/components/editorial/EntityForms';
import { EntityTable } from '@/components/editorial/EntityTable';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { noRead } from '@/components/shared/ForbiddenScreen';
import { ListHeader, PageHeader, PageTrail } from '@/components/shared/PageHeader';
import { siteTrail } from '@/components/shared/trail.ts';
import { withoutId } from '@/components/shared/withoutId.ts';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import { can } from '@/domain/access/rbac.ts';

import { mediaSource } from './conteudos/editor-options.ts';
import { positiveInt } from './conteudos/params.ts';
import {
  createAuthorAction,
  createMenuAction,
  createTaxonomyAction,
  updateAuthorAction,
  updateMenuAction,
  updateTaxonomyAction,
} from './editorial-actions.ts';
import {
  lookupSite,
  noWrite,
  readAuthors,
  readMenus,
  readTaxonomies,
  sitePageContext,
} from './editorial-page.tsx';
import { itemTitle } from './item-title.ts';

// Páginas de autores, taxonomias e menus (#46, #108, #308): lista, criar e editar montadas
// por tipo a partir do `ENTITY_CONFIG`. Cada `page.tsx` só exporta `default` e
// `generateMetadata` da fábrica e mantém o `export const dynamic` (o Next exige literal).

type SiteParams = { params: Promise<{ site: string }> };
type ItemParams = { params: Promise<{ site: string; id: string }> };

/** O que a rota exporta: a página e o título da aba. */
type EditorialPage<P> = {
  default: (props: P) => Promise<ReactNode>;
  generateMetadata: (props: P) => Promise<Metadata>;
};

/** O que depende do servidor, por tipo: leitura da lista, Server Actions e mídia do site. */
const ROUTES: {
  [K in EntityKind]: {
    read: (siteId: string) => Promise<Result<EntityItems[K][]> | undefined>;
    create: (siteId: string, value: unknown) => Promise<EntityFormResult>;
    update: (siteId: string, id: number, value: unknown) => Promise<EntityFormResult>;
    /** Biblioteca do site no formulário (#182): só o avatar do autor. */
    media: boolean;
  };
} = {
  author: {
    read: readAuthors,
    create: createAuthorAction,
    update: updateAuthorAction,
    media: true,
  },
  taxonomy: {
    read: readTaxonomies,
    create: createTaxonomyAction,
    update: updateTaxonomyAction,
    media: false,
  },
  menu: { read: readMenus, create: createMenuAction, update: updateMenuAction, media: false },
};

/**
 * Lista do tipo, com busca e paginação (#108); criar e editar só com content.write. No padrão
 * do template (#363): a trilha acima do cartão; título, ação, toolbar e tabela dentro dele.
 */
export function editorialListPage<K extends EntityKind>(kind: K): EditorialPage<SiteParams> {
  const config = ENTITY_CONFIG[kind];
  const routes = ROUTES[kind];

  async function ListPage({ params }: SiteParams) {
    const { site: siteId } = await params;
    const context = await sitePageContext(siteId);
    if (!context.ok) return context.render;
    const { site, canWrite } = context.value;
    const items = await routes.read(site.id);
    if (!items?.ok) return noRead;

    const create = canWrite ? (
      <ButtonLink href={`/sites/${site.id}/${config.segment}/novo`} variant="solid" size="sm">
        {config.createLabel}
      </ButtonLink>
    ) : undefined;
    const titleId = `${config.htmlId.many}-title`;

    return (
      <section aria-labelledby={titleId} className="list-width space-y-4">
        <PageTrail items={siteTrail(site, config.area)} />
        <AdaptiveCard>
          <div className="flex flex-col gap-4">
            <ListHeader id={titleId} title={config.area} action={create} />
            <EntityTable
              basePath={`/sites/${site.id}/${config.segment}`}
              headers={config.list.headers}
              rows={items.value.map((item) => config.list.row(item))}
              empty={config.list.empty}
              search={config.list.search}
              truncated={config.list.truncated}
              canWrite={canWrite}
              emptyAction={create}
              labelledBy={titleId}
            />
          </div>
        </AdaptiveCard>
      </section>
    );
  }

  return {
    default: ListPage,
    generateMetadata: () => Promise.resolve({ title: config.area }),
  };
}

/** Criação do tipo, só com content.write; volta para a lista ao salvar. */
export function editorialCreatePage<K extends EntityKind>(kind: K): EditorialPage<SiteParams> {
  const config = ENTITY_CONFIG[kind];
  const routes = ROUTES[kind];

  async function CreatePage({ params }: SiteParams) {
    const { site: siteId } = await params;
    const context = await sitePageContext(siteId);
    if (!context.ok) return context.render;
    const { site, canWrite } = context.value;
    if (!canWrite) return noWrite(site);
    const titleId = `new-${config.htmlId.one}-title`;

    return (
      <section aria-labelledby={titleId} className="space-y-4">
        {/* A largura fica na coluna do formulário: a barra de ações encosta nas bordas do main. */}
        <div className="form-width space-y-4">
          <PageHeader
            id={titleId}
            trail={siteTrail(site, { label: config.area, segment: config.segment }, [
              { label: config.createLabel },
            ])}
            title={config.createLabel}
          />
        </div>
        <EntityForm
          kind={kind}
          mode="create"
          siteId={site.id}
          defaultValues={config.newValues}
          media={routes.media ? mediaSource(site.id) : undefined}
          contentClassName="form-width"
          action={routes.create.bind(null, site.id)}
        />
      </section>
    );
  }

  return {
    default: CreatePage,
    generateMetadata: () => Promise.resolve({ title: config.createLabel }),
  };
}

/** Edição de um item do tipo, só com content.write; 404 quando o item não existe. */
export function editorialEditPage<K extends EntityKind>(kind: K): EditorialPage<ItemParams> {
  const config = ENTITY_CONFIG[kind];
  const routes = ROUTES[kind];

  /** "<nome> · Editar <tipo>", só quando a página mostraria o formulário (#79). */
  async function generateMetadata({ params }: ItemParams): Promise<Metadata> {
    const { site: siteId, id } = await params;
    const itemId = positiveInt(id);
    const lookup = await lookupSite(siteId);
    const editable =
      itemId !== undefined && lookup.kind === 'found' && can(lookup.actor, 'content.write');
    const items = editable ? await routes.read(siteId) : undefined;
    const item = items?.ok ? items.value.find((entry) => entry.id === itemId) : undefined;
    return { title: itemTitle(item && config.itemName(item), config.editArea) };
  }

  async function EditPage({ params }: ItemParams) {
    const { site: siteId, id } = await params;
    const itemId = positiveInt(id);
    if (itemId === undefined) notFound();
    const context = await sitePageContext(siteId);
    if (!context.ok) return context.render;
    const { site, canWrite } = context.value;
    if (!canWrite) return noWrite(site);
    const items = await routes.read(site.id);
    if (!items?.ok) return noRead;
    const item = items.value.find((entry) => entry.id === itemId);
    if (item === undefined) notFound();
    const name = config.itemName(item);
    const titleId = `edit-${config.htmlId.one}-title`;

    return (
      <section aria-labelledby={titleId} className="space-y-4">
        {/* A largura fica na coluna do formulário: a barra de ações encosta nas bordas do main. */}
        <div className="form-width space-y-4">
          <PageHeader
            id={titleId}
            trail={siteTrail(site, { label: config.area, segment: config.segment }, [
              { label: name },
            ])}
            title={`Editar “${name}”`}
          />
        </div>
        <EntityForm
          kind={kind}
          mode="edit"
          siteId={site.id}
          defaultValues={withoutId(item)}
          media={routes.media ? mediaSource(site.id) : undefined}
          contentClassName="form-width"
          action={routes.update.bind(null, site.id, item.id)}
        />
      </section>
    );
  }

  return { default: EditPage, generateMetadata };
}
