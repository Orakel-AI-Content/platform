'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Block } from '@orakel/content-model/v1';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useId, useState, useTransition } from 'react';
import { FormProvider, get, useFieldArray, useForm, type FieldValues } from 'react-hook-form';

import {
  BLOCK_SCHEMAS,
  ContentEditorSchema,
  ContentMetaSchema,
  isBlockType,
  newBlock,
  savedFormValues,
  type ContentFormResult,
} from '@/components/content-editor-values.ts';
import { entityField, mediaField, type PickerOption } from '@/components/forms/picker-fields';
import { richTextField } from '@/components/forms/rich-text-field';
import { SchemaFields, type FieldRenderer } from '@/components/forms/schema-form';
import { BLOCK_TYPE_LABEL } from '@/components/site-labels.ts';
import { blockSummary, blockText } from '@/components/block-summary.ts';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useLeaveGuard } from '@/components/use-leave-guard.ts';
import type { ContentEdit } from '@/domain/content/contents.ts';
import { cn } from '@/lib/utils';

// Editor de artigos e páginas (#45): um formulário só; os metadados e cada bloco são
// desenhados pelo gerador, e a lista de blocos (tipo, ordem, remoção) é daqui. O `n` de
// bloco novo é do servidor; a permissão e as referências são conferidas no domínio. Salvar
// fica numa barra fixa no rodapé e mantém a pessoa no editor (#109): a edição recomeça da
// versão salva relida do servidor; a criação vai para a edição do conteúdo criado.

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

/** Por quanto tempo o "Desfazer" da remoção de bloco fica disponível (#112). */
export const UNDO_MS = 10_000;

/** Campo que recebe o foco no bloco devolvido; sem ele (texto rico), o próprio bloco. */
const FOCUSABLE_FIELD = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]';

type RemovedBlock = { index: number; value: FieldValues; position: number };

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
  created = false,
  previewUrl,
}: {
  mode: 'create' | 'edit';
  siteId: string;
  defaultValues: FieldValues;
  options: ContentEditorOptions;
  action: (input: ContentEdit) => Promise<ContentFormResult>;
  /** Acabou de ser criado (`?criado=1`): anuncia a confirmação e tira a marca da URL. */
  created?: boolean;
  /** Prévia da última versão salva (#110); sem ela (criação), "Ver prévia" fica desabilitada. */
  previewUrl?: string;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  // Último bloco removido (#112): devolvido pelo "Desfazer" por 10 s, ou até salvar.
  const [removed, setRemoved] = useState<RemovedBlock | null>(null);
  const form = useForm<FieldValues>({
    resolver: zodResolver(
      ContentEditorSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as never,
    defaultValues,
  });
  const blocks = useFieldArray({ control: form.control, name: 'blocks' });
  // Blocos recolhidos (#135), pelo `field.id`, só enquanto a tela está aberta.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleBlock = (fieldId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(fieldId)) next.add(fieldId);
      return next;
    });
  // O `reset` de salvar troca os `field.id`: as posições recolhidas atravessam o reset (salvar
  // não muda a ordem). Ajuste durante o render, quando a lista de ids muda.
  const [carried, setCarried] = useState<number[] | null>(null);
  const fieldIds = blocks.fields.map((field) => field.id).join(' ');
  const [seenIds, setSeenIds] = useState(fieldIds);
  if (fieldIds !== seenIds) {
    setSeenIds(fieldIds);
    if (carried) {
      setCollapsed(new Set(carried.flatMap((index) => blocks.fields[index]?.id ?? [])));
      setCarried(null);
    }
  }
  /** Expande os blocos dos índices e, no quadro seguinte, foca o primeiro campo inválido. */
  const revealErrors = (indexes: readonly number[]) => {
    const ids = new Set(indexes.flatMap((index) => blocks.fields[index]?.id ?? []));
    setCollapsed((current) => new Set([...current].filter((fieldId) => !ids.has(fieldId))));
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`#${CSS.escape(id)}-form [aria-invalid="true"]`)?.focus(),
    );
  };
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

  // No quadro seguinte à montagem: texto já presente quando a região `role="status"` aparece
  // não é anunciado; a mudança depois de montar é.
  useEffect(() => {
    if (!created) return;
    const frame = requestAnimationFrame(() => setSaved('Conteúdo criado.'));
    router.replace(pathname, { scroll: false });
    return () => cancelAnimationFrame(frame);
  }, [created, pathname, router]);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const removeBlock = (index: number) => {
    const value = form.getValues(`blocks.${index}`) as FieldValues;
    blocks.remove(index);
    setSaved('');
    setRemoved({ index, value, position: index + 1 });
  };

  /** Depois de desenhar: o primeiro campo do bloco, ou o próprio bloco (texto rico). */
  const focusBlock = (index: number) =>
    requestAnimationFrame(() => {
      const block = document.getElementById(`${id}-block-${index}`);
      const field = block?.querySelector<HTMLElement>(FOCUSABLE_FIELD);
      (field ?? block)?.focus();
    });

  const undoRemove = () => {
    if (!removed) return;
    const { index, value, position } = removed;
    blocks.insert(index, value, { shouldFocus: false });
    setRemoved(null);
    setSaved(`Bloco ${position} devolvido.`);
    focusBlock(index);
  };

  /** Bloco novo do tipo escolhido nesta posição (#134); os seguintes são renumerados. */
  const insertBlock = (index: number, type: Block['type']) => {
    blocks.insert(index, newBlock(type), { shouldFocus: false });
    focusBlock(index);
  };

  const onValid = (value: FieldValues) =>
    startTransition(async () => {
      setSummary([]);
      setSaved('');
      // Valores crus da tela (o `value` do resolver já vem sem os vazios): base do reset.
      const sent = form.getValues();
      const result = await action(value as ContentEdit);
      if (result.ok) {
        if (mode === 'create') {
          router.replace(`/sites/${siteId}/conteudos/${result.id}/editar?criado=1`);
          return;
        }
        setCarried(
          blocks.fields.flatMap((field, index) => (collapsed.has(field.id) ? [index] : [])),
        );
        if (result.saved) form.reset(savedFormValues(result.saved, sent) as FieldValues);
        // O `n` do bloco removido não existe na versão salva: não há mais o que desfazer.
        setRemoved(null);
        setSaved(result.message);
        router.refresh();
        return;
      }
      const top: string[] = [];
      let focused = false;
      revealErrors(
        result.issues.flatMap((issue) =>
          issue.path[0] === 'blocks' && typeof issue.path[1] === 'number' ? [issue.path[1]] : [],
        ),
      );
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

  // Os valores iniciais vêm sem os campos vazios (descrição, SEO, capa), que a tela registra
  // com `''`: sem completar, editar e desfazer deixaria o formulário "alterado" (#111). Uma
  // vez, ao montar: um `router.refresh` depois não pode apagar o que se digita.
  const [initial] = useState(defaultValues);
  useEffect(() => {
    form.reset(savedFormValues(initial, form.getValues()) as FieldValues);
  }, [form, initial]);

  // Sair com alterações não salvas pede confirmação (#111); salvar zera o `isDirty`.
  useLeaveGuard(form.formState.isDirty);
  const blocksError = errorAt(form.formState.errors, 'blocks');
  const previewNote = !previewUrl
    ? 'Salve para ver a prévia.'
    : form.formState.isDirty
      ? 'As alterações não salvas não aparecem na prévia.'
      : '';
  return (
    <FormProvider {...form}>
      <form
        id={`${id}-form`}
        noValidate
        className="space-y-6"
        onSubmit={(event) =>
          void form.handleSubmit(onValid, (errors) => {
            setSummary(['Corrija os campos destacados.']);
            const blockErrors: unknown = errors.blocks;
            revealErrors(
              Array.isArray(blockErrors)
                ? blockErrors.flatMap((error, index) => (error ? [index] : []))
                : [],
            );
          })(event)
        }
      >
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
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-blocks`} className="mr-auto text-lg font-semibold">
              Blocos
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCollapsed(new Set(blocks.fields.map((field) => field.id)))}
            >
              Recolher todos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
              Expandir todos
            </Button>
          </div>
          {blocks.fields.map((field, index) => {
            const { type } = field as { type?: unknown };
            if (!isBlockType(type)) return null;
            const position = index + 1;
            const isCollapsed = collapsed.has(field.id);
            return (
              <Fragment key={field.id}>
                <ActionsMenu
                  trigger={{ label: `Inserir bloco na posição ${position}`, icon: <Plus /> }}
                >
                  {offered.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={buttonVariants({
                        variant: 'ghost',
                        size: 'sm',
                        className: 'justify-start',
                      })}
                      onClick={() => insertBlock(index, option)}
                    >
                      {BLOCK_TYPE_LABEL[option]}
                    </button>
                  ))}
                </ActionsMenu>
                <fieldset
                  id={`${id}-block-${index}`}
                  tabIndex={-1}
                  className="space-y-4 rounded-md border border-border p-4"
                >
                  {/* O nome do grupo; o cabeçalho visível repete o texto com aria-hidden. */}
                  <legend className="sr-only">{`Bloco ${position}: ${BLOCK_TYPE_LABEL[type]}`}</legend>
                  <div className="flex items-center gap-2">
                    <IconButton
                      label={`Conteúdo do bloco ${position}`}
                      icon={isCollapsed ? <ChevronRight /> : <ChevronDown />}
                      aria-expanded={!isCollapsed}
                      aria-controls={`${id}-block-body-${index}`}
                      onClick={() => toggleBlock(field.id)}
                    />
                    <span aria-hidden="true" className="shrink-0 text-sm font-semibold">
                      {`Bloco ${position}: ${BLOCK_TYPE_LABEL[type]}`}
                    </span>
                    {isCollapsed && (
                      <span
                        className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                        title={blockText(form.getValues(`blocks.${index}`)) || undefined}
                      >
                        {blockSummary(form.getValues(`blocks.${index}`))}
                      </span>
                    )}
                    <div className="ml-auto flex shrink-0 gap-1">
                      <IconButton
                        label={`Mover bloco ${position} para cima`}
                        icon={<ArrowUp />}
                        // aria-disabled (não disabled): o foco fica no botão depois de mover.
                        aria-disabled={index === 0}
                        onClick={() => index > 0 && blocks.move(index, index - 1)}
                      />
                      <IconButton
                        label={`Mover bloco ${position} para baixo`}
                        icon={<ArrowDown />}
                        aria-disabled={index === blocks.fields.length - 1}
                        onClick={() =>
                          index < blocks.fields.length - 1 && blocks.move(index, index + 1)
                        }
                      />
                      <IconButton
                        label={`Remover bloco ${position}`}
                        icon={<Trash2 />}
                        onClick={() => removeBlock(index)}
                      />
                    </div>
                  </div>
                  {/* Recolhido, só oculto: os campos seguem registrados e o TipTap guarda o texto. */}
                  <div id={`${id}-block-body-${index}`} hidden={isCollapsed}>
                    <SchemaFields
                      schema={BLOCK_SCHEMAS[type]}
                      prefix={`blocks.${index}`}
                      labels={BLOCK_LABELS}
                      hidden={['blocks.*.n', 'blocks.*.type', 'blocks.*.new']}
                      fields={blockFields[type]}
                    />
                  </div>
                </fieldset>
              </Fragment>
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
                className="flex min-h-9 rounded-md border border-border bg-background px-3 py-1 text-sm"
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

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-background py-3">
          <Button type="submit" disabled={pending || form.formState.isSubmitting}>
            {pending ? 'Salvando…' : mode === 'create' ? 'Criar conteúdo' : 'Salvar nova versão'}
          </Button>
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={`${id}-preview-note`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Ver prévia<span className="sr-only"> (abre em nova aba)</span>
            </a>
          ) : (
            <Button variant="outline" disabled aria-describedby={`${id}-preview-note`}>
              Ver prévia
            </Button>
          )}
          {/* aria-live sem role: o `status` da barra é a confirmação do salvamento. */}
          <p
            id={`${id}-preview-note`}
            aria-live="polite"
            className="text-sm text-muted-foreground empty:hidden"
          >
            {previewNote}
          </p>
          {/* Uma região só: a confirmação do salvamento ou a remoção, a mais recente (#112). */}
          <p role="status" className="text-sm text-muted-foreground">
            {removed ? `Bloco ${removed.position} removido.` : saved}
          </p>
          {removed && (
            <Button variant="outline" size="sm" onClick={undoRemove}>
              Desfazer
            </Button>
          )}
          <div role="alert" className={cn(summary.length > 0 && 'text-sm text-destructive')}>
            {summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
