'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Block } from '@orakel/content-model/v1';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from 'react';
import { PiArrowDown, PiArrowUp, PiCaretDown, PiCaretRight, PiPlus, PiTrash } from 'react-icons/pi';
import { FormProvider, get, useFieldArray, useForm, type FieldValues } from 'react-hook-form';

import {
  BLOCK_SCHEMAS,
  ContentEditorSchema,
  ContentMetaSchema,
  isBlockType,
  newBlock,
  savedFormValues,
  slugFromTitle,
  type ContentFormResult,
} from '@/components/contents/contentEditorValues.ts';
import {
  entityField,
  mediaField,
  type MediaSource,
  type PickerOption,
} from '@/components/forms/PickerFields';
import { richTextField } from '@/components/forms/RichTextField';
import {
  FieldGroup,
  FormActionBar,
  SchemaFields,
  type FieldRenderer,
} from '@/components/forms/SchemaForm';
import { zonedDateTimeField } from '@/components/forms/ZonedDatetimeField';
import { pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import { applyServerIssues } from '@/components/shared/applyServerIssues.ts';
import { ErrorSummary } from '@/components/shared/ErrorSummary.tsx';
import { BLOCK_TYPE_LABEL } from '@/components/shared/siteLabels.ts';
import { blockSummary, blockText } from '@/components/contents/blockSummary.ts';
import { CONTENT_META_LABELS } from '@/components/contents/contentLabels.ts';
import { IconButton } from '@/components/shared/IconButton';
import { Button } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dropdown from '@/components/ui/Dropdown';
import Input from '@/components/ui/Input';
import Notification from '@/components/ui/Notification';
import toast from '@/components/ui/toast';
import Tooltip from '@/components/ui/Tooltip';
import classNames from '@/components/ui/utils/classNames';
import { useCreatedAnnouncement } from '@/components/shared/useCreatedAnnouncement.ts';
import { useLeaveGuard } from '@/components/shared/useLeaveGuard.ts';
import type { ContentEdit } from '@/domain/content/contents.ts';

// Editor de artigos e páginas (#45): um formulário só; os metadados e cada bloco são
// desenhados pelo gerador, e a lista de blocos (tipo, ordem, remoção) é daqui. O `n` de
// bloco novo é do servidor; a permissão e as referências são conferidas no domínio. Salvar
// mantém a pessoa no editor (#109): a edição recomeça da versão salva relida do servidor; a
// criação vai para a edição do conteúdo criado. O retorno segue o padrão das ações: o sucesso
// vai para o toast e o resumo de erros para o Alert da barra. Esqueleto do formulário de tela
// (#332), como o `SchemaForm`: metadados e cada bloco num `Card` e a barra fixa
// (`FormActionBar`) com "Descartar" (criação) ou "Voltar" (edição), "Ver prévia" e o envio.
// Na edição sem alteração (#525), "Salvar" fica indisponível (`aria-disabled`, focável) e a
// nota ligada a ele diz por quê; o formulário não envia, nem pelo Enter num campo.
// Na criação (#590), o slug acompanha o título até a pessoa editar o slug; o título e a descrição
// para buscadores mostram quantos caracteres têm.

const META_HINTS: Record<string, string> = {
  slug: 'Minúsculas, números e hífens.',
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
  /** Biblioteca do site pela grade (#182): actions ligadas ao site pela página. */
  media: MediaSource;
  authors: readonly PickerOption[];
  taxonomies: readonly PickerOption[];
};

/** Rótulo do envio, parado e durante o envio: "Criar"/"Salvar" e o gerúndio (#334). */
const SUBMIT_LABEL = {
  create: { idle: 'Criar', pending: 'Criando…' },
  edit: { idle: 'Salvar', pending: 'Salvando…' },
  amend: { idle: 'Salvar correção', pending: 'Salvando correção…' },
} as const;

/** Por quanto tempo o "Desfazer" da remoção de bloco fica disponível no toast (#112). */
export const UNDO_MS = 10_000;

/** Campo que recebe o foco no bloco devolvido; sem ele (texto rico), o próprio bloco. */
const FOCUSABLE_FIELD = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]';

/** Contagem de caracteres em pt-BR: "1 caractere", "0 caracteres". */
const characters = (count: number) => `${count} ${count === 1 ? 'caractere' : 'caracteres'}`;

/**
 * Campo de texto com a contagem de caracteres sob ele (#590), ligada pelo `aria-describedby`; o
 * `Input` soma a ela a dica e o erro do `FormItem`. Só conta: o tamanho não tem limite rígido.
 */
const countedTextField: FieldRenderer = ({
  id,
  name,
  value,
  onChange,
  invalid,
  required,
  ref,
  readOnly,
}) => {
  const text = typeof value === 'string' ? value : '';
  return (
    <>
      <Input
        id={id}
        name={name}
        ref={(element) => ref(element instanceof HTMLElement ? element : null)}
        value={text}
        readOnly={readOnly}
        aria-invalid={invalid}
        aria-required={required || undefined}
        aria-describedby={`${id}-count`}
        onChange={(event) => onChange(event.target.value)}
      />
      <div id={`${id}-count`} className="form-hint">
        {characters(text.length)}
      </div>
    </>
  );
};

/** Mensagem de erro sob um caminho (para os erros de lista, como "ao menos um bloco"). */
const errorAt = (errors: FieldValues, path: string): string | undefined => {
  const node = get(errors, path) as { message?: string; root?: { message?: string } } | undefined;
  return node?.root?.message ?? node?.message;
};

/** Gatilho de "Inserir bloco" com a aparência do `IconButton` (`Button` `plain` `xs`: 32 px). */
const INSERT_TOGGLE_CLASS =
  'button inline-flex h-8 w-8 items-center justify-center rounded-lg text-base hover:text-primary-mild';

/**
 * "Inserir bloco" (#134) no `Dropdown` do Ecme, que dá as setas, o typeahead e o Esc com o
 * foco de volta. Como no `IconButton`, a dica é só visual: o `aria-describedby` que o
 * `Tooltip` injeta repetiria o nome, então fica de fora.
 */
function InsertMenu(props: ComponentProps<typeof Dropdown> & { 'aria-describedby'?: string }) {
  // O `aria-describedby` depois do spread substitui o do `Tooltip`.
  return <Dropdown {...props} aria-describedby={undefined} />;
}

export function ContentEditor({
  mode,
  siteId,
  timeZone,
  defaultValues,
  options,
  action,
  backHref,
  contentClassName,
  created = false,
  previewUrl,
}: {
  /**
   * `amend` (#751): a correção do revisor durante a revisão. Funciona como `edit` (sem o tipo,
   * sem salvar o que não mudou), mas salvar volta à revisão (`backHref`) em vez de continuar
   * no editor.
   */
  mode: 'create' | 'edit' | 'amend';
  siteId: string;
  /** Fuso IANA do site: a data de publicação é escolhida e mostrada nele (#183). */
  timeZone: string;
  defaultValues: FieldValues;
  options: ContentEditorOptions;
  action: (input: ContentEdit) => Promise<ContentFormResult>;
  /**
   * Destino de "Voltar" (edição: link, com o aviso de saída) e de "Descartar" (criação:
   * confirmado num diálogo): o nível anterior da trilha.
   */
  backHref: string;
  /** Largura da coluna de cartões e da barra (`form-width`); quem decide é a página. */
  contentClassName?: string;
  /** Acabou de ser criado (`?criado=1`): anuncia a confirmação e tira a marca da URL. */
  created?: boolean;
  /** Prévia da última versão salva (#110); sem ela (criação), "Ver prévia" fica desabilitada. */
  previewUrl?: string;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string[]>([]);
  // Toast do último bloco removido (#112): o "Desfazer" o devolve por 10 s, ou até salvar.
  const undoToast = useRef<string | null>(null);
  const form = useForm<FieldValues>({
    resolver: zodResolver(
      ContentEditorSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as never,
    defaultValues,
  });
  const blocks = useFieldArray({ control: form.control, name: 'blocks' });
  // Slug do título (#590): só na criação e enquanto o slug não foi editado à mão. Pelo
  // `subscribe`, não pelo `watch`, que tira o editor do React Compiler. O valor automático
  // entra como o padrão do campo (`resetField`), não por `setValue`: o react-hook-form
  // recalcula os `dirtyFields` comparando valor e padrão, e um `setValue` sem `shouldDirty`
  // deixaria o slug "alterado" já na primeira tecla do título.
  useEffect(() => {
    if (mode !== 'create') return;
    return form.subscribe({
      name: 'title',
      exact: true,
      formState: { values: true },
      callback: ({ values }) => {
        if (form.getFieldState('slug').isDirty) return;
        const title: unknown = values.title;
        const slug = slugFromTitle(typeof title === 'string' ? title : '');
        if (slug === form.getValues('slug')) return;
        form.resetField('slug', { defaultValue: slug });
        if (form.formState.isSubmitted) void form.trigger('slug');
      },
    });
  }, [form, mode]);
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
  // SEO recolhível (#591): fechado ao abrir a tela; abre sozinho quando tem campo com erro.
  const [seoOpen, setSeoOpen] = useState(false);
  /**
   * Expande os blocos dos índices (e o SEO, se tem erro) e, no quadro seguinte, foca o
   * primeiro campo inválido.
   */
  const revealErrors = (indexes: readonly number[], seo: boolean) => {
    const ids = new Set(indexes.flatMap((index) => blocks.fields[index]?.id ?? []));
    setCollapsed((current) => new Set([...current].filter((fieldId) => !ids.has(fieldId))));
    if (seo) setSeoOpen(true);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`#${CSS.escape(id)}-form [aria-invalid="true"]`)?.focus(),
    );
  };
  const offered = options.blockTypes.filter(isBlockType);

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
    publishedAt: zonedDateTimeField(timeZone),
    'seo.title': countedTextField,
    'seo.description': countedTextField,
  };

  useCreatedAnnouncement(created ? 'Conteúdo criado.' : undefined, pushSuccess);

  /** Tira o toast do "Desfazer", se ainda estiver na tela. */
  const dropUndo = () => {
    if (undoToast.current !== null) toast.remove(undoToast.current);
    undoToast.current = null;
  };
  // Saindo do editor, o "Desfazer" não tem mais para onde devolver o bloco.
  const onLeave = useEffectEvent(dropUndo);
  useEffect(() => () => onLeave(), []);

  const removeBlock = (index: number) => {
    const value = form.getValues(`blocks.${index}`) as FieldValues;
    blocks.remove(index);
    dropUndo();
    // Só a remoção mais recente se desfaz; o toast sai sozinho no prazo (`duration`).
    undoToast.current = toast.push(
      <Notification type="info" title={`Bloco ${index + 1} removido.`} duration={UNDO_MS}>
        <Button type="button" size="sm" onClick={() => undoRemove(index, value)}>
          Desfazer
        </Button>
      </Notification>,
    );
  };

  /** Depois de desenhar: o primeiro campo do bloco, ou o próprio bloco (texto rico). */
  const focusBlock = (index: number) =>
    requestAnimationFrame(() => {
      const block = document.getElementById(`${id}-block-${index}`);
      const field = block?.querySelector<HTMLElement>(FOCUSABLE_FIELD);
      (field ?? block)?.focus();
    });

  const undoRemove = (index: number, value: FieldValues) => {
    blocks.insert(index, value, { shouldFocus: false });
    dropUndo();
    pushSuccess(`Bloco ${index + 1} devolvido.`);
    focusBlock(index);
  };

  /** Bloco novo do tipo escolhido nesta posição (#134); os seguintes são renumerados. */
  const insertBlock = (index: number, type: Block['type']) => {
    blocks.insert(index, newBlock(type), { shouldFocus: false });
    focusBlock(index);
  };

  /** "+" que insere um bloco na posição `index + 1` (#134; o do fim, #591). */
  const insertMenu = (index: number) => {
    const label = `Inserir bloco na posição ${index + 1}`;
    return (
      <Tooltip title={label} wrapperClass="inline-flex">
        <InsertMenu
          aria-label={label}
          toggleClassName={INSERT_TOGGLE_CLASS}
          renderTitle={<PiPlus aria-hidden />}
        >
          {offered.map((option) => (
            <Dropdown.Item
              key={option}
              eventKey={option}
              onClick={() => insertBlock(index, option)}
            >
              {BLOCK_TYPE_LABEL[option]}
            </Dropdown.Item>
          ))}
        </InsertMenu>
      </Tooltip>
    );
  };

  const onValid = (value: FieldValues) =>
    startTransition(async () => {
      setSummary([]);
      // Valores crus da tela (o `value` do resolver já vem sem os vazios): base do reset.
      const sent = form.getValues();
      const result = await action(value as ContentEdit);
      if (result.ok) {
        if (mode === 'create') {
          router.replace(`/sites/${siteId}/conteudos/${result.id}/editar?criado=1`);
          return;
        }
        if (mode === 'amend') {
          // A revisão mostra a versão nova; o toast confirma a correção depois da navegação.
          form.reset(sent);
          pushSuccess(result.message);
          router.push(backHref);
          return;
        }
        setCarried(
          blocks.fields.flatMap((field, index) => (collapsed.has(field.id) ? [index] : [])),
        );
        if (result.saved) form.reset(savedFormValues(result.saved, sent) as FieldValues);
        // O `n` do bloco removido não existe na versão salva: não há mais o que desfazer.
        dropUndo();
        pushSuccess(result.message);
        router.refresh();
        return;
      }
      revealErrors(
        result.issues.flatMap((issue) =>
          issue.path[0] === 'blocks' && typeof issue.path[1] === 'number' ? [issue.path[1]] : [],
        ),
        result.issues.some((issue) => issue.path[0] === 'seo'),
      );
      const top = applyServerIssues(form.setError, result.issues);
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
  const busy = pending || form.formState.isSubmitting;
  const previewNote = !previewUrl
    ? 'Salve para ver a prévia.'
    : form.formState.isDirty
      ? 'As alterações não salvas não aparecem na prévia.'
      : '';
  // Edição sem alteração (#525): nada a enviar; o domínio também não grava (#523).
  const unchanged = mode !== 'create' && !form.formState.isDirty;
  return (
    <FormProvider {...form}>
      <form
        id={`${id}-form`}
        noValidate
        className="flex flex-col"
        onSubmit={(event) => {
          if (unchanged) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(onValid, (errors) => {
            setSummary(['Corrija os campos destacados.']);
            const blockErrors: unknown = errors.blocks;
            revealErrors(
              Array.isArray(blockErrors)
                ? blockErrors.flatMap((error, index) => (error ? [index] : []))
                : [],
              errors.seo !== undefined,
            );
          })(event);
        }}
      >
        {/* Duas colunas a partir de `xl` (#591), como o `ProductForm` do Ecme: os dados vêm
            primeiro no DOM (primeiros no empilhado e no Tab) e o `flex-row-reverse` os põe à
            direita. */}
        <div className={classNames('flex flex-col gap-4 xl:flex-row-reverse', contentClassName)}>
          <div className="flex flex-col gap-4 xl:w-[440px] xl:shrink-0 2xl:w-[500px]">
            <section aria-labelledby={`${id}-meta`}>
              <Card>
                {/* Como o título de seção do `SchemaForm`: o `h4 mb-6` do Ecme, `h2` na estrutura. */}
                <h2
                  id={`${id}-meta`}
                  className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100"
                >
                  Dados do conteúdo
                </h2>
                <SchemaFields
                  schema={ContentMetaSchema}
                  labels={CONTENT_META_LABELS}
                  hints={{ ...META_HINTS, publishedAt: `Horário de ${timeZone}` }}
                  // O tipo não muda depois de criado; `updatedAt` é do site, não do editor; o
                  // SEO tem cartão próprio, recolhível.
                  hidden={mode === 'create' ? ['updatedAt', 'seo'] : ['kind', 'updatedAt', 'seo']}
                  fields={metaFields}
                />
              </Card>
            </section>

            <section aria-labelledby={`${id}-seo`}>
              <Card>
                <div className="flex items-center gap-2">
                  <IconButton
                    label="Campos de SEO"
                    icon={seoOpen ? <PiCaretDown /> : <PiCaretRight />}
                    aria-expanded={seoOpen}
                    aria-controls={`${id}-seo-body`}
                    onClick={() => setSeoOpen((open) => !open)}
                  />
                  <h2
                    id={`${id}-seo`}
                    className="text-xl font-bold text-gray-900 dark:text-gray-100"
                  >
                    SEO
                  </h2>
                </div>
                {/* Fechado, só oculto: os campos seguem registrados (valores e erros). */}
                <div id={`${id}-seo-body`} hidden={!seoOpen} className="mt-6">
                  <SchemaFields
                    schema={ContentMetaSchema.shape.seo}
                    prefix="seo"
                    labels={CONTENT_META_LABELS}
                    fields={metaFields}
                  />
                </div>
              </Card>
            </section>
          </div>

          {/* O erro da lista ("ao menos um bloco") é a mensagem do `FormItem` (#329). */}
          <FieldGroup
            as="section"
            message={blocksError}
            aria-labelledby={`${id}-blocks`}
            className="min-w-0 flex-auto space-y-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`${id}-blocks`} className="mr-auto text-lg font-semibold">
                Blocos
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={() => setCollapsed(new Set(blocks.fields.map((field) => field.id)))}
              >
                Recolher todos
              </Button>
              <Button type="button" size="sm" onClick={() => setCollapsed(new Set())}>
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
                  {insertMenu(index)}
                  <Card>
                    <fieldset id={`${id}-block-${index}`} tabIndex={-1}>
                      {/* O nome do grupo; o cabeçalho visível repete o texto com aria-hidden. */}
                      <legend className="sr-only">{`Bloco ${position}: ${BLOCK_TYPE_LABEL[type]}`}</legend>
                      <div className="flex items-center gap-2">
                        <IconButton
                          label={`Conteúdo do bloco ${position}`}
                          icon={isCollapsed ? <PiCaretRight /> : <PiCaretDown />}
                          aria-expanded={!isCollapsed}
                          aria-controls={`${id}-block-body-${index}`}
                          onClick={() => toggleBlock(field.id)}
                        />
                        <span aria-hidden="true" className="shrink-0 text-sm font-semibold">
                          {`Bloco ${position}: ${BLOCK_TYPE_LABEL[type]}`}
                        </span>
                        {isCollapsed && (
                          <span
                            className="min-w-0 flex-1 truncate text-sm"
                            title={blockText(form.getValues(`blocks.${index}`)) || undefined}
                          >
                            {blockSummary(form.getValues(`blocks.${index}`))}
                          </span>
                        )}
                        <div className="ml-auto flex shrink-0 gap-1">
                          <IconButton
                            label={`Mover bloco ${position} para cima`}
                            icon={<PiArrowUp />}
                            // aria-disabled (não disabled): o foco fica no botão depois de mover.
                            aria-disabled={index === 0}
                            onClick={() => index > 0 && blocks.move(index, index - 1)}
                          />
                          <IconButton
                            label={`Mover bloco ${position} para baixo`}
                            icon={<PiArrowDown />}
                            aria-disabled={index === blocks.fields.length - 1}
                            onClick={() =>
                              index < blocks.fields.length - 1 && blocks.move(index, index + 1)
                            }
                          />
                          <IconButton
                            label={`Remover bloco ${position}`}
                            icon={<PiTrash />}
                            onClick={() => removeBlock(index)}
                          />
                        </div>
                      </div>
                      {/* Recolhido, só oculto: os campos seguem registrados e o TipTap guarda o texto. */}
                      <div id={`${id}-block-body-${index}`} hidden={isCollapsed} className="mt-4">
                        <SchemaFields
                          schema={BLOCK_SCHEMAS[type]}
                          prefix={`blocks.${index}`}
                          labels={BLOCK_LABELS}
                          hidden={['blocks.*.n', 'blocks.*.type', 'blocks.*.new']}
                          fields={blockFields[type]}
                        />
                      </div>
                    </fieldset>
                  </Card>
                </Fragment>
              );
            })}
            {/* O "+" do fim (#591): o único caminho para o primeiro bloco e para o último. */}
            {insertMenu(blocks.fields.length)}
          </FieldGroup>
        </div>
        ;
        <FormActionBar
          kind={mode === 'create' ? 'create' : 'edit'}
          href={backHref}
          contentClassName={contentClassName}
          pending={busy}
          submit={
            <Button
              type="submit"
              variant="solid"
              disabled={busy}
              // aria-disabled (não disabled): fica no Tab e a nota chega com o foco (#525).
              aria-disabled={unchanged || undefined}
              aria-describedby={unchanged ? `${id}-save-note` : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {SUBMIT_LABEL[mode][busy ? 'pending' : 'idle']}
            </Button>
          }
          extra={
            previewUrl ? (
              <Button
                asElement="a"
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby={`${id}-preview-note`}
              >
                Ver prévia<span className="sr-only"> (abre em nova aba)</span>
              </Button>
            ) : (
              <Button type="button" disabled aria-describedby={`${id}-preview-note`}>
                Ver prévia
              </Button>
            )
          }
        >
          {/* aria-live sem role: o `status` é o do toast, que confirma o salvamento. */}
          <p id={`${id}-preview-note`} aria-live="polite" className="mt-2 text-sm empty:hidden">
            {previewNote}
          </p>
          {/* Sem aria-live: mudaria a cada tecla; é a descrição do "Salvar", lida no foco. */}
          {unchanged && (
            <p id={`${id}-save-note`} className="mt-2 text-sm">
              Nenhuma alteração para salvar.
            </p>
          )}
          <ErrorSummary lines={summary} className="not-empty:mt-3" />
        </FormActionBar>
      </form>
    </FormProvider>
  );
}
