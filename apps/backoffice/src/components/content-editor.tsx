'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Block } from '@orakel/content-model/v1';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { FormProvider, get, useFieldArray, useForm, type FieldValues } from 'react-hook-form';

import {
  BLOCK_SCHEMAS,
  ContentEditorSchema,
  ContentMetaSchema,
  isBlockType,
  newBlock,
  type ContentFormResult,
} from '@/components/content-editor-values.ts';
import { entityField, mediaField, type PickerOption } from '@/components/forms/picker-fields';
import { richTextField } from '@/components/forms/rich-text-field';
import { SchemaFields, type FieldRenderer } from '@/components/forms/schema-form';
import { BLOCK_TYPE_LABEL } from '@/components/site-labels.ts';
import { Button } from '@/components/ui/button';
import type { ContentEdit } from '@/domain/content/contents.ts';
import { cn } from '@/lib/utils';

// Editor de artigos e páginas (#45): um formulário só; os metadados e cada bloco são
// desenhados pelo gerador, e a lista de blocos (tipo, ordem, remoção) é daqui. O `n` de
// bloco novo é do servidor; a permissão e as referências são conferidas no domínio.

const META_LABELS: Record<string, string> = {
  kind: 'Tipo',
  'kind=article': 'Artigo',
  'kind=page': 'Página',
  slug: 'Slug',
  title: 'Título',
  description: 'Descrição',
  authorIds: 'Autores',
  taxonomyIds: 'Taxonomias',
  coverMediaId: 'Capa',
  publishedAt: 'Data de publicação',
  seo: 'SEO',
  'seo.title': 'Título para buscadores',
  'seo.description': 'Descrição para buscadores',
  'seo.canonical': 'Endereço canônico',
};

const META_HINTS: Record<string, string> = {
  slug: 'Minúsculas, números e hífens.',
  publishedAt: 'Data e hora com fuso, ex.: 2026-10-06T12:00:00-03:00.',
};

const BLOCK_LABELS: Record<string, string> = {
  'blocks.*.content': 'Texto',
  'blocks.*.title': 'Título do sumário',
  'blocks.*.attribution': 'Autoria',
  'blocks.*.sourceUrl': 'Endereço da fonte',
  'blocks.*.mediaId': 'Mídia',
  'blocks.*.alt': 'Texto alternativo',
  'blocks.*.decorative': 'Imagem decorativa (sem texto alternativo)',
  'blocks.*.caption': 'Legenda',
  'blocks.*.items': 'Perguntas',
  'blocks.*.items.*': 'pergunta',
  'blocks.*.items.*.question': 'Pergunta',
  'blocks.*.items.*.answer': 'Resposta',
};

export type ContentEditorOptions = {
  /** Tipos de bloco que a release suporta (`RESOURCES.blockTypes`). */
  blockTypes: readonly string[];
  media: readonly PickerOption[];
  authors: readonly PickerOption[];
  taxonomies: readonly PickerOption[];
};

/** Mensagem de erro sob um caminho (para os erros de lista, como "ao menos um bloco"). */
const errorAt = (errors: FieldValues, path: string): string | undefined => {
  const node = get(errors, path) as { message?: string; root?: { message?: string } } | undefined;
  return node?.root?.message ?? node?.message;
};

export function ContentEditor({
  mode,
  siteId,
  defaultValues,
  options,
  action,
}: {
  mode: 'create' | 'edit';
  siteId: string;
  defaultValues: FieldValues;
  options: ContentEditorOptions;
  action: (input: ContentEdit) => Promise<ContentFormResult>;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string[]>([]);
  const form = useForm<FieldValues>({
    resolver: zodResolver(
      ContentEditorSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as never,
    defaultValues,
  });
  const blocks = useFieldArray({ control: form.control, name: 'blocks' });
  const offered = options.blockTypes.filter(isBlockType);
  const [nextType, setNextType] = useState<Block['type'] | undefined>(offered[0]);

  const blockFields: Record<Block['type'], Record<string, FieldRenderer>> = {
    text: { 'blocks.*.content': richTextField('richText') },
    toc: {},
    quote: { 'blocks.*.content': richTextField('inlines') },
    image: {
      'blocks.*.mediaId': mediaField(options.media),
      'blocks.*.caption': richTextField('inlines'),
    },
    faq: { 'blocks.*.items.*.answer': richTextField('inlines') },
  };
  const metaFields: Record<string, FieldRenderer> = {
    authorIds: entityField(options.authors, 'Nenhum autor cadastrado neste site.'),
    taxonomyIds: entityField(options.taxonomies, 'Nenhuma taxonomia cadastrada neste site.'),
    coverMediaId: mediaField(options.media, { optional: true }),
  };

  const onValid = (value: FieldValues) =>
    startTransition(async () => {
      setSummary([]);
      const result = await action(value as ContentEdit);
      if (result.ok) {
        router.push(
          mode === 'create'
            ? `/sites/${siteId}/conteudos`
            : `/sites/${siteId}/conteudos/${result.id}`,
        );
        router.refresh();
        return;
      }
      const top: string[] = [];
      let focused = false;
      for (const issue of result.issues) {
        if (issue.path.length === 0) {
          top.push(issue.message);
          continue;
        }
        form.setError(
          issue.path.join('.'),
          { type: 'server', message: issue.message },
          { shouldFocus: !focused },
        );
        focused = true;
      }
      setSummary(top.length > 0 ? top : [result.message]);
    });

  const blocksError = errorAt(form.formState.errors, 'blocks');
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) =>
          void form.handleSubmit(onValid, () => setSummary(['Corrija os campos destacados.']))(
            event,
          )
        }
      >
        <div role="alert" className={cn(summary.length > 0 && 'text-sm text-destructive')}>
          {summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <fieldset className="space-y-4 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Dados do conteúdo</legend>
          <SchemaFields
            schema={ContentMetaSchema}
            labels={META_LABELS}
            hints={META_HINTS}
            // O tipo não muda depois de criado; `updatedAt` é do site, não do editor.
            hidden={mode === 'edit' ? ['kind', 'updatedAt'] : ['updatedAt']}
            fields={metaFields}
          />
        </fieldset>

        <section aria-labelledby={`${id}-blocks`} className="space-y-4">
          <h2 id={`${id}-blocks`} className="text-lg font-semibold">
            Blocos
          </h2>
          {blocks.fields.map((field, index) => {
            const { type } = field as { type?: unknown };
            if (!isBlockType(type)) return null;
            const position = index + 1;
            return (
              <fieldset key={field.id} className="space-y-4 rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-semibold">
                  {`Bloco ${position}: ${BLOCK_TYPE_LABEL[type]}`}
                </legend>
                <SchemaFields
                  schema={BLOCK_SCHEMAS[type]}
                  prefix={`blocks.${index}`}
                  labels={BLOCK_LABELS}
                  hidden={['blocks.*.n', 'blocks.*.type', 'blocks.*.new']}
                  fields={blockFields[type]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    // aria-disabled (não disabled): o foco fica no botão depois de mover.
                    aria-disabled={index === 0}
                    onClick={() => index > 0 && blocks.move(index, index - 1)}
                  >
                    {`Mover bloco ${position} para cima`}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-disabled={index === blocks.fields.length - 1}
                    onClick={() =>
                      index < blocks.fields.length - 1 && blocks.move(index, index + 1)
                    }
                  >
                    {`Mover bloco ${position} para baixo`}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => blocks.remove(index)}>
                    {`Remover bloco ${position}`}
                  </Button>
                </div>
              </fieldset>
            );
          })}
          {blocksError && <p className="text-sm text-destructive">{blocksError}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-new-type`} className="text-sm font-medium">
                Tipo do novo bloco
              </label>
              <select
                id={`${id}-new-type`}
                className="flex min-h-9 rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                value={nextType ?? ''}
                onChange={(event) =>
                  setNextType(isBlockType(event.target.value) ? event.target.value : undefined)
                }
              >
                {offered.map((type) => (
                  <option key={type} value={type}>
                    {BLOCK_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={nextType === undefined}
              onClick={() => nextType && blocks.append(newBlock(nextType))}
            >
              Adicionar bloco
            </Button>
          </div>
        </section>

        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : mode === 'create' ? 'Criar conteúdo' : 'Salvar nova versão'}
        </Button>
      </form>
    </FormProvider>
  );
}
