'use client';

import {
  AuthorSchema,
  InstitutionalTextsSchema,
  MenuSchema,
  TaxonomySchema,
} from '@orakel/content-model/v1';
import { useRouter } from 'next/navigation';
import type * as z from 'zod';

import { mediaField, type MediaSource } from '@/components/forms/PickerFields';
import { richTextField } from '@/components/forms/RichTextField';
import {
  SchemaForm,
  type FieldRenderer,
  type SchemaFormIssue,
} from '@/components/forms/SchemaForm';

// Formulários das entidades editoriais do site (#46): o gerador sobre os schemas do
// content-model; regras (slug único, permissão) ficam no domínio e voltam pelo campo.

/** Retorno das Server Actions das entidades (serializável; `path` aponta o campo). */
export type EntityFormResult =
  { ok: true; message: string } | { ok: false; message: string; issues: SchemaFormIssue[] };

export type EntityKind = 'author' | 'taxonomy' | 'menu';

type EntityConfig = {
  schema: z.ZodType;
  /** Segmento da lista em `/sites/<site>/…`. */
  segment: string;
  labels: Record<string, string>;
  hints?: Record<string, string>;
  /** Campos especiais; os de mídia usam a biblioteca do site (só quando a página a passa). */
  fields?: (media: MediaSource | undefined) => Record<string, FieldRenderer>;
};

const SLUG_HINT = 'Minúsculas, números e hífens.';

export const ENTITY_CONFIG: Record<EntityKind, EntityConfig> = {
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
    fields: (media): Record<string, FieldRenderer> =>
      media ? { avatarMediaId: mediaField(media, { optional: true }) } : {},
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
  },
};

/** Criação ou edição de autor, taxonomia ou menu; volta para a lista ao salvar. */
export function EntityForm({
  kind,
  mode,
  siteId,
  defaultValues,
  media,
  action,
}: {
  kind: EntityKind;
  mode: 'create' | 'edit';
  siteId: string;
  defaultValues: Record<string, unknown>;
  /** Biblioteca do site para o avatar (#182); as outras entidades não usam mídia. */
  media?: MediaSource;
  action: (value: unknown) => Promise<EntityFormResult>;
}) {
  const router = useRouter();
  const config = ENTITY_CONFIG[kind];
  return (
    <SchemaForm
      schema={config.schema}
      defaultValues={defaultValues}
      labels={config.labels}
      hints={config.hints}
      fields={config.fields?.(media)}
      submitLabel={mode === 'create' ? 'Criar' : 'Salvar'}
      pendingLabel={mode === 'create' ? 'Criando…' : 'Salvando…'}
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        router.push(`/sites/${siteId}/${config.segment}`);
        router.refresh();
      }}
    />
  );
}

const INSTITUTIONAL_LABELS: Record<string, string> = {
  about: 'Sobre',
  contact: 'Contato',
  terms: 'Termos de uso',
  privacy: 'Política de privacidade',
  editorialPolicy: 'Política editorial',
};

const INSTITUTIONAL_FIELDS = Object.fromEntries(
  Object.keys(INSTITUTIONAL_LABELS).map((key) => [key, richTextField('richText')]),
);

/** Textos institucionais: cada um em rich text; salvar grava a versão nova da configuração. */
export function InstitutionalTextsForm({
  defaultValues,
  action,
}: {
  defaultValues: Record<string, unknown>;
  action: (value: unknown) => Promise<EntityFormResult>;
}) {
  const router = useRouter();
  return (
    <SchemaForm
      schema={InstitutionalTextsSchema}
      defaultValues={defaultValues}
      labels={INSTITUTIONAL_LABELS}
      fields={INSTITUTIONAL_FIELDS}
      submitLabel="Salvar textos"
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        router.refresh();
        return { success: result.message };
      }}
    />
  );
}
