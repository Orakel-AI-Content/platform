import {
  AuthorSchema,
  MenuSchema,
  TaxonomySchema,
  type Author,
  type Menu,
  type Taxonomy,
} from '@orakel/content-model/v1';
import type * as z from 'zod';

import { mediaField, type MediaSource } from '@/components/forms/PickerFields';
import type { FieldRenderer } from '@/components/forms/SchemaForm';
import { TAXONOMY_KIND_LABEL } from '@/components/shared/siteLabels.ts';

import type { EntityRow, EntitySearch } from './EntityTable';

// Configuração por tipo das entidades editoriais (#46, #308): o formulário (cliente) e as
// páginas (servidor) leem daqui, por isso o módulo não é cliente. `fields` só é chamado
// pelo formulário: o servidor nunca toca no `mediaField`.

/** Entidade de cada tipo, como o domínio a lista. */
export type EntityItems = { author: Author; taxonomy: Taxonomy; menu: Menu };

export type EntityKind = keyof EntityItems;

export type EntityConfig<T> = {
  schema: z.ZodType;
  /** Segmento da lista em `/sites/<site>/…`. */
  segment: string;
  labels: Record<string, string>;
  hints?: Record<string, string>;
  /** Campos curtos relacionados, lado a lado a partir de `md` (#328). */
  sideBySide?: string[][];
  /** Campos especiais; os de mídia usam a biblioteca do site (só quando a página a passa). */
  fields?: (media: MediaSource | undefined) => Record<string, FieldRenderer>;
  /** Base dos ids dos títulos: `<plural>-title`, `new-<one>-title`, `edit-<one>-title`. */
  htmlId: { one: string; many: string };
  /** Título da lista e área da trilha. */
  area: string;
  /** Botão, trilha e título da tela de criar. */
  createLabel: string;
  /** Área do título da aba na edição (#79). */
  editArea: string;
  /** Valores iniciais do formulário de criar. */
  newValues: Record<string, unknown>;
  /** Nome do item na trilha, no título e na aba. */
  itemName: (item: T) => string;
  list: {
    headers: [string, ...string[]];
    row: (item: T) => EntityRow;
    /** Lista vazia: nada cadastrado. */
    empty: string;
    search: EntitySearch;
    /** Índices de `cells` cortados numa linha, com o texto inteiro em `title` (#363). */
    truncated?: readonly number[];
  };
};

const SLUG_HINT = 'Minúsculas, números e hífens.';

export const ENTITY_CONFIG: { [K in EntityKind]: EntityConfig<EntityItems[K]> } = {
  author: {
    schema: AuthorSchema.omit({ id: true }),
    segment: 'autores',
    labels: {
      name: 'Nome',
      slug: 'Slug',
      bio: 'Biografia',
      expertise: 'Área de atuação',
      avatarMediaId: 'Foto',
    },
    hints: { slug: SLUG_HINT },
    sideBySide: [['name', 'slug']],
    fields: (media): Record<string, FieldRenderer> =>
      media ? { avatarMediaId: mediaField(media, { optional: true }) } : {},
    htmlId: { one: 'author', many: 'authors' },
    area: 'Autores',
    createLabel: 'Criar autor',
    editArea: 'Editar autor',
    newValues: { slug: '', name: '' },
    itemName: (author) => author.name,
    list: {
      headers: ['Nome', 'Slug', 'Área de atuação'],
      row: (author) => ({
        id: author.id,
        name: author.name,
        cells: [author.slug, author.expertise ?? '—'],
      }),
      empty: 'Nenhum autor cadastrado.',
      search: { label: 'Buscar por nome', notFound: 'Nenhum autor encontrado.' },
      truncated: [1],
    },
  },
  taxonomy: {
    schema: TaxonomySchema.omit({ id: true }),
    segment: 'taxonomias',
    labels: {
      kind: 'Tipo',
      'kind=category': 'Categoria',
      'kind=tag': 'Tag',
      'kind=series': 'Série',
      name: 'Nome',
      slug: 'Slug',
      description: 'Descrição',
    },
    hints: { slug: SLUG_HINT },
    sideBySide: [['name', 'slug']],
    htmlId: { one: 'taxonomy', many: 'taxonomies' },
    area: 'Taxonomias',
    createLabel: 'Criar taxonomia',
    editArea: 'Editar taxonomia',
    newValues: { kind: 'category', slug: '', name: '' },
    itemName: (taxonomy) => taxonomy.name,
    list: {
      headers: ['Nome', 'Tipo', 'Slug'],
      row: (taxonomy) => ({
        id: taxonomy.id,
        name: taxonomy.name,
        cells: [TAXONOMY_KIND_LABEL[taxonomy.kind], taxonomy.slug],
      }),
      empty: 'Nenhuma taxonomia cadastrada.',
      search: { label: 'Buscar por nome', notFound: 'Nenhuma taxonomia encontrada.' },
    },
  },
  menu: {
    schema: MenuSchema.omit({ id: true }),
    segment: 'menus',
    labels: {
      key: 'Chave',
      items: 'Itens',
      'items.*': 'item',
      'items.*.label': 'Rótulo',
      'items.*.href': 'Link',
    },
    hints: {
      key: 'Onde o menu aparece, ex.: principal, rodape.',
      'items.*.href': 'Caminho iniciado por / ou URL http/https.',
    },
    sideBySide: [['items.*.label', 'items.*.href']],
    htmlId: { one: 'menu', many: 'menus' },
    area: 'Menus',
    createLabel: 'Criar menu',
    editArea: 'Editar menu',
    newValues: { key: '', items: [{ label: '', href: '' }] },
    itemName: (menu) => menu.key,
    list: {
      headers: ['Chave', 'Itens'],
      row: (menu) => ({
        id: menu.id,
        name: menu.key,
        cells: [menu.items.map((item) => `${item.label} (${item.href})`).join(' · ')],
      }),
      empty: 'Nenhum menu cadastrado.',
      search: { label: 'Buscar por chave', notFound: 'Nenhum menu encontrado.' },
      truncated: [0],
    },
  },
};
