'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import { TbArrowNarrowLeft, TbTrash } from 'react-icons/tb';
import {
  Controller,
  FormProvider,
  get,
  useFieldArray,
  useForm,
  useFormContext,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
} from 'react-hook-form';
import * as z from 'zod';

import { pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import { applyServerIssues } from '@/components/shared/applyServerIssues.ts';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import { ErrorSummary } from '@/components/shared/ErrorSummary.tsx';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import { Form, FormItem } from '@/components/ui/Form';
import { useFormItem } from '@/components/ui/Form/context';
import Input from '@/components/ui/Input';
import classNames from '@/components/ui/utils/classNames';
import BottomStickyBar from '@/components/template/BottomStickyBar';
import { PAGE_CONTAINER_GUTTER_X } from '@/components/template/constants';

import { clean, describe, emptyValue, pattern, type FieldNode } from './schemaWalk.ts';

// Gerador de formulários a partir de um schema Zod de objeto (padrão do Backoffice,
// docs/design/design-system.md). Desenha texto, número, booleano, enum, objeto e lista de
// objetos; o resto (rich text, seletores de mídia e de entidade) entra pelo registro de
// campos, por caminho com `*` no lugar dos índices. A validação é só a do schema.
// Visual do Ecme (#245): cada campo num `FormItem` (rótulo e mensagem de erro ligados ao
// controle), texto e número no `Input`, booleano no `Checkbox`, botões no `Button` e as seções em
// `Card`, como os formulários do template (ProductForm). O enum continua `<select>` nativo, com
// as classes do `Input`.
// Erro, dica e obrigatoriedade só no `FormItem` (#329): a dica é o `hint` dele, o erro é a
// mensagem dele (`.form-explain`) em todo tipo de campo, inclusive caixa de seleção e lista (num
// `FormItem` sem rótulo), e campo não opcional no schema leva o asterisco e `aria-required`.
// Formulário de tela (#328), como o `CustomerForm` do Ecme: `Form` → coluna de `Card`s (um por
// seção, ou um só) → `BottomStickyBar` com "Descartar" (criação, confirmado num diálogo, como o
// `CustomerCreate`) ou "Voltar" (edição, como o `CustomerEdit`) e a ação principal. Os campos
// curtos relacionados ficam lado a lado a partir de `md` (`sideBySide`). Formulário dentro de
// outra tela (checklist da revisão) não liga a barra nem cria cartão: quem o contém já é o
// cartão.

/** Props de um campo registrado: valor e mudança vêm do react-hook-form (Controller). */
export type FieldProps = {
  id: string;
  name: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  describedBy: string | undefined;
  /**
   * Não opcional no schema: o rótulo mostra o asterisco; ponha `aria-required` no controle se o
   * papel dele admitir (campo de texto, `select`, `radiogroup`; um `group` não admite).
   */
  required: boolean;
  /** Ligue ao controle focável: o foco do erro (inclusive do servidor) chega até ele. */
  ref: (element: HTMLElement | null) => void;
  /** Caminho em `readOnly`: mostre o valor sem permitir mudança. */
  readOnly: boolean;
};

export type FieldRenderer = (props: FieldProps) => ReactNode;

/** Grupo de chaves de topo do schema, com título; `id` vira a âncora `#secao-<id>`. */
export type SchemaFormSection = { id: string; title: string; paths: string[] };

/**
 * Barra de ações da tela (`BottomStickyBar`): na criação, "Descartar" pede confirmação e vai
 * para `href`; na edição, "Voltar" é um link para `href` (o nível anterior da trilha).
 */
export type SchemaFormActionBar = { kind: 'create' | 'edit'; href: string };

export type SchemaFormProps<T> = {
  schema: z.ZodType<T>;
  defaultValues: Record<string, unknown>;
  /** Rótulos por caminho (`items.*.question`); sem rótulo, usa o nome do campo. */
  labels?: Record<string, string>;
  hints?: Record<string, string>;
  /** Caminhos sem campo: o valor segue como veio (ex.: `n`, `type` dos blocos). */
  hidden?: string[];
  /** Caminhos só leitura: o campo aparece com o valor, sem permitir mudança. */
  readOnly?: string[];
  /** Campos especiais por caminho; têm prioridade sobre o desenho padrão. */
  fields?: Record<string, FieldRenderer>;
  /**
   * Seções na mesma página, com um índice no topo. Chave de topo fora de todas vai depois
   * delas, sem título; sem seções, o desenho é uma coluna só.
   */
  sections?: SchemaFormSection[];
  /**
   * Grupos de campos curtos relacionados, lado a lado a partir de `md` (`grid md:grid-cols-2`),
   * por caminho com `*` no lugar dos índices (`['name', 'slug']`, `['items.*.label', ...]`).
   */
  sideBySide?: string[][];
  /** Formulário de tela: campos em `Card` e a barra fixa com Descartar/Voltar e o envio. */
  actionBar?: SchemaFormActionBar;
  /** Largura da coluna de cartões e da barra (`form-width`); quem decide é a página. */
  contentClassName?: string;
  submitLabel: string;
  /** Rótulo do botão durante o envio (desabilitado até a resposta); padrão "Salvando…". */
  pendingLabel?: string;
  /** Envio bloqueado (ex.: aprovação com erro de validação); o motivo vai em `submitDescribedBy`. */
  submitDisabled?: boolean;
  /** `id` do texto que explica o bloqueio do envio (`aria-describedby` do botão). */
  submitDescribedBy?: string;
  /**
   * Recebe o valor validado pelo schema. Pode devolver a recusa do servidor: cada issue com
   * `path` vira erro do campo; sem `path`, vai para o resumo. `{ success }` é a confirmação,
   * mostrada no toast (retorno padrão das ações, `ActionFeedback.tsx`).
   */
  onSubmit: (value: T) => SubmitOutcome | Promise<SubmitOutcome>;
};

/** Recusa do servidor (serializável; `path` aponta o campo). */
export type SchemaFormIssue = { path: (string | number)[]; message: string };

type SubmitOutcome = void | readonly SchemaFormIssue[] | { success: string };

type Ctx = {
  id: string;
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  labels: Record<string, string>;
  hints: Record<string, string>;
  hidden: ReadonlySet<string>;
  readOnly: ReadonlySet<string>;
  fields: Record<string, FieldRenderer>;
  sideBySide: readonly string[][];
};

/** `<select>` nativo com a aparência do `Input` do Ecme (tamanho `md`). */
const selectClass = (invalid: boolean) =>
  classNames(
    'input input-md h-12',
    invalid
      ? 'input-invalid'
      : 'focus:ring-primary focus-within:ring-primary focus-within:border-primary focus:border-primary',
  );

/** Borda dos grupos (objeto, lista e item de lista). */
const groupClass = 'rounded-xl border border-gray-200 dark:border-gray-700';

/** Aviso de campo sem editor, no Alert de aviso do Ecme: nunca omissão silenciosa. */
function NoEditor({ label, path }: { label: string; path: string }) {
  return (
    <Alert type="warning" showIcon duration={0} className="mb-7">
      {label}: sem editor para este campo (registre um campo para {pattern(path)}).
    </Alert>
  );
}

/** Primeira mensagem de erro num nó da árvore de erros (pode estar num item interno). */
function firstMessage(node: unknown): string | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  if ('message' in node && typeof node.message === 'string' && node.message !== '') {
    return node.message;
  }
  for (const child of Object.values(node)) {
    const message = firstMessage(child);
    if (message) return message;
  }
  return undefined;
}

/** Primeira mensagem de erro sob um caminho (o erro pode estar num item interno). */
function messageAt(errors: FieldErrors<FieldValues>, path: string): string | undefined {
  return firstMessage(get(errors, path));
}

/** Um erro do resumo: o campo (`path`) e se ele tem controle focável (lista não tem). */
type ErrorItem = { path: string; message: string; focusable: boolean };

/**
 * Um item por campo inválido, na ordem do schema. O erro sob um campo registrado conta como
 * um só (como em `messageAt`); o da lista inteira (`root` ou o próprio nó) vai sem foco.
 */
function errorItems(
  errors: FieldErrors<FieldValues>,
  schema: z.ZodType,
  registered: ReadonlySet<string>,
): ErrorItem[] {
  const items: ErrorItem[] = [];
  const visit = (node: unknown, kind: FieldNode | undefined, path: string) => {
    if (node === null || typeof node !== 'object') return;
    const list = kind?.kind === 'array';
    if (path !== '' && registered.has(pattern(path))) {
      const message = firstMessage(node);
      if (message) items.push({ path, message, focusable: true });
      return;
    }
    if ('message' in node && typeof node.message === 'string' && node.message !== '') {
      items.push({ path, message: node.message, focusable: !list });
      return;
    }
    const root = list && 'root' in node ? firstMessage(node.root) : undefined;
    if (root) items.push({ path, message: root, focusable: false });
    const keys = Object.keys(node).filter((key) => key !== 'root' && key !== 'ref');
    // Objeto: ordem do schema, e o que não está nele (caminho do servidor) por último.
    const ordered =
      kind?.kind === 'object'
        ? [
            ...Object.keys(kind.shape).filter((key) => keys.includes(key)),
            ...keys.filter((key) => !(key in kind.shape)),
          ]
        : keys;
    for (const key of ordered) {
      const child =
        kind?.kind === 'object'
          ? kind.shape[key]
          : kind?.kind === 'array'
            ? kind.element
            : undefined;
      visit(
        (node as Record<string, unknown>)[key],
        child && describe(child).node,
        path === '' ? key : `${path}.${key}`,
      );
    }
  };
  visit(errors, describe(schema).node, '');
  return items;
}

/** Rótulo do campo no resumo, com a posição em cada lista (`Pergunta (pergunta 2)`). */
function summaryLabel(labels: Record<string, string>, path: string): string {
  const segments = path.split('.');
  const own = segments.findLast((segment) => !/^\d+$/.test(segment)) ?? path;
  const positions = segments.flatMap((segment, index) =>
    /^\d+$/.test(segment)
      ? [
          `${labels[`${pattern(segments.slice(0, index).join('.'))}.*`] ?? 'item'} ${Number(segment) + 1}`,
        ]
      : [],
  );
  const base = /^\d+$/.test(segments.at(-1) ?? '') ? undefined : (labels[pattern(path)] ?? own);
  if (base === undefined) return positions.join(', ');
  return positions.length > 0 ? `${base} (${positions.join(', ')})` : base;
}

const labelOf = (ctx: Ctx, path: string, key: string) => ctx.labels[pattern(path)] ?? key;

/** O que o controle de um campo recebe para se ligar ao rótulo, à dica e ao erro. */
type ControlProps = {
  id: string;
  invalid: boolean;
  /**
   * Dica e erro do `FormItem`: para controles que não leem o contexto dele (registrados,
   * `<select>`, `Checkbox`); o `Input` do Ecme os soma sozinho.
   */
  describedBy: string | undefined;
  required: boolean;
};

/** Lê os ids da dica e da mensagem de erro do `FormItem` (o do erro, só enquanto inválido). */
function FieldControl({
  children,
  ...props
}: Omit<ControlProps, 'describedBy'> & { children: (props: ControlProps) => ReactNode }) {
  const formItem = useFormItem();
  const describedBy = [formItem?.hintId, formItem?.errorId].filter(Boolean).join(' ') || undefined;
  return <>{children({ ...props, describedBy })}</>;
}

/**
 * Rótulo, controle, dica e erro ligados por id e aria-describedby, num `FormItem`. Sem `label`,
 * o `FormItem` não desenha rótulo: o controle traz o seu (caixa de seleção).
 */
function Field({
  ctx,
  path,
  label,
  required,
  children,
}: {
  ctx: Ctx;
  path: string;
  label: string | undefined;
  required: boolean;
  children: (props: ControlProps) => ReactNode;
}) {
  const fieldId = `${ctx.id}-${path}`;
  const message = messageAt(ctx.errors, path);
  return (
    <FormItem
      htmlFor={fieldId}
      label={label}
      asterisk={required}
      hint={ctx.hints[pattern(path)]}
      invalid={message !== undefined}
      errorMessage={message}
    >
      <FieldControl id={fieldId} invalid={message !== undefined} required={required}>
        {children}
      </FieldControl>
    </FormItem>
  );
}

function Node({
  ctx,
  schema,
  path,
  name,
}: {
  ctx: Ctx;
  schema: z.ZodType;
  path: string;
  name: string;
}) {
  if (ctx.hidden.has(pattern(path))) return null;
  const label = labelOf(ctx, path, name);
  // Não opcional no schema: asterisco no rótulo e `aria-required` no controle.
  const required = !describe(schema).optional;

  const registered = ctx.fields[pattern(path)];
  if (registered) {
    return (
      <Field ctx={ctx} path={path} label={label} required={required}>
        {({ id, invalid, describedBy, required }) => (
          <Controller
            control={ctx.control}
            name={path}
            render={({ field }) => (
              <>
                {registered({
                  id,
                  name: path,
                  label,
                  value: field.value,
                  onChange: field.onChange,
                  invalid,
                  describedBy,
                  required,
                  ref: field.ref,
                  readOnly: ctx.readOnly.has(pattern(path)),
                })}
              </>
            )}
          />
        )}
      </Field>
    );
  }

  const { node } = describe(schema);
  switch (node.kind) {
    case 'literal':
      return null;
    case 'string':
      return (
        <Field ctx={ctx} path={path} label={label} required={required}>
          {({ id, invalid, required }) => (
            <Input
              id={id}
              readOnly={ctx.readOnly.has(pattern(path))}
              aria-invalid={invalid}
              aria-required={required || undefined}
              {...ctx.register(path)}
            />
          )}
        </Field>
      );
    case 'number':
      return (
        <Field ctx={ctx} path={path} label={label} required={required}>
          {({ id, invalid, required }) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              aria-invalid={invalid}
              aria-required={required || undefined}
              {...ctx.register(path, { valueAsNumber: true })}
            />
          )}
        </Field>
      );
    case 'enum':
      return (
        <Field ctx={ctx} path={path} label={label} required={required}>
          {({ id, invalid, describedBy, required }) => (
            <select
              id={id}
              className={selectClass(invalid)}
              aria-invalid={invalid}
              aria-required={required || undefined}
              aria-describedby={describedBy}
              {...ctx.register(path)}
            >
              {node.options.map((option) => (
                <option key={option} value={option}>
                  {ctx.labels[`${pattern(path)}=${option}`] ?? option}
                </option>
              ))}
            </select>
          )}
        </Field>
      );
    case 'boolean':
      // Sem rótulo no `FormItem`: o rótulo é o do próprio `Checkbox` (o texto ao lado da caixa).
      // Sem asterisco: `false` é valor válido, "não opcional" não quer dizer "precisa marcar".
      return (
        <Field ctx={ctx} path={path} label={undefined} required={false}>
          {({ invalid, describedBy }) => (
            <Controller
              control={ctx.control}
              name={path}
              render={({ field }) => (
                <Checkbox
                  ref={field.ref}
                  name={field.name}
                  checked={field.value === true}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(checked) => field.onChange(checked)}
                >
                  {label}
                </Checkbox>
              )}
            />
          )}
        </Field>
      );
    case 'object':
      return (
        <fieldset className={classNames(groupClass, 'mb-7 p-4')}>
          <legend className="px-1 font-semibold text-gray-900 dark:text-gray-100">{label}</legend>
          <Children ctx={ctx} shape={node.shape} prefix={path} />
        </fieldset>
      );
    case 'array':
      return <ArrayField ctx={ctx} element={node.element} path={path} label={label} />;
    default:
      // Sem desenho padrão e sem campo registrado: aviso visível, nunca omissão silenciosa.
      return <NoEditor label={label} path={path} />;
  }
}

function Children({
  ctx,
  shape,
  prefix,
}: {
  ctx: Ctx;
  shape: Record<string, z.ZodType>;
  prefix: string;
}) {
  const join = (key: string) => (prefix === '' ? key : `${prefix}.${key}`);
  const node = ([key, child]: [string, z.ZodType]) => (
    <Node key={join(key)} ctx={ctx} schema={child} path={join(key)} name={key} />
  );
  const entries = Object.entries(shape);
  const grouped = new Set<string>();
  return (
    <>
      {entries.map((entry) => {
        const [key] = entry;
        if (grouped.has(key)) return null;
        const group = ctx.sideBySide.find((paths) => paths.includes(pattern(join(key))));
        if (group === undefined) return node(entry);
        // Campos curtos relacionados lado a lado a partir de `md`, como no `CustomerForm`.
        const members = entries.filter(([other]) => group.includes(pattern(join(other))));
        for (const [other] of members) grouped.add(other);
        return (
          <div key={`grupo-${join(key)}`} className="grid md:grid-cols-2 gap-4">
            {members.map(node)}
          </div>
        );
      })}
    </>
  );
}

type FieldGroupProps = {
  /** Erro da lista inteira (ex.: "ao menos um item"); sem ele, o grupo está válido. */
  message: string | undefined;
  /** `fieldset` (nome no `legend`) ou `section` (nome pelo `aria-labelledby` do título). */
  as?: 'fieldset' | 'section';
} & HTMLAttributes<HTMLElement>;

/**
 * Grupo (lista) num `FormItem` sem rótulo: a mensagem de erro é a do `FormItem` e entra no
 * `aria-describedby` do grupo enquanto ele está inválido.
 */
export function FieldGroup({ message, ...props }: FieldGroupProps) {
  return (
    <FormItem invalid={message !== undefined} errorMessage={message}>
      <GroupElement {...props} />
    </FormItem>
  );
}

function GroupElement({ as: Element = 'fieldset', ...props }: Omit<FieldGroupProps, 'message'>) {
  const errorId = useFormItem()?.errorId;
  return <Element aria-describedby={errorId} {...props} />;
}

/** Lista de objetos: um fieldset por item, com adicionar e remover. */
function ArrayField({
  ctx,
  element,
  path,
  label,
}: {
  ctx: Ctx;
  element: z.ZodType;
  path: string;
  label: string;
}) {
  const { fields, append, remove } = useFieldArray({ control: ctx.control, name: path });
  // Remover pede confirmação (#327). O índice fica depois de fechar: o título não muda
  // durante a saída do diálogo.
  const [removing, setRemoving] = useState({ index: 0, open: false });
  const itemNode = describe(element).node;
  const itemLabel = ctx.labels[`${pattern(path)}.*`] ?? 'item';
  const arrayError = get(ctx.errors, path) as
    { message?: string; root?: { message?: string } } | undefined;
  const message = arrayError?.root?.message ?? arrayError?.message;
  if (itemNode.kind !== 'object') {
    return <NoEditor label={label} path={path} />;
  }
  return (
    <FieldGroup
      message={typeof message === 'string' ? message : undefined}
      className={classNames(groupClass, 'space-y-4 p-4')}
    >
      <legend className="px-1 font-semibold text-gray-900 dark:text-gray-100">{label}</legend>
      {fields.map((item, index) => (
        <fieldset key={item.id} className={classNames(groupClass, 'p-4')}>
          <legend className="px-1 text-sm font-semibold">{`${itemLabel} ${index + 1}`}</legend>
          <Children ctx={ctx} shape={itemNode.shape} prefix={`${path}.${index}`} />
          <Button
            type="button"
            size="sm"
            customColorClass={dangerButtonClass}
            onClick={() => setRemoving({ index, open: true })}
          >
            {`Remover ${itemLabel} ${index + 1}`}
          </Button>
        </fieldset>
      ))}
      <ConfirmDialog
        isOpen={removing.open}
        type="danger"
        title={`Remover ${itemLabel} ${removing.index + 1}?`}
        confirmText="Remover"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setRemoving({ ...removing, open: false })}
        onConfirm={() => {
          remove(removing.index);
          setRemoving({ ...removing, open: false });
        }}
      >
        <p>O item e o que foi preenchido nele saem do formulário.</p>
      </ConfirmDialog>
      <Button type="button" size="sm" onClick={() => append(emptyValue(element))}>
        {`Adicionar ${itemLabel}`}
      </Button>
    </FieldGroup>
  );
}

export type SchemaFieldsProps = {
  schema: z.ZodType;
  /** Caminho do objeto no formulário externo (`blocks.2`); vazio é a raiz. */
  prefix?: string;
  labels?: Record<string, string>;
  hints?: Record<string, string>;
  hidden?: string[];
  readOnly?: string[];
  fields?: Record<string, FieldRenderer>;
  /** Só na raiz (`prefix` vazio): agrupa as chaves de topo em seções com `h2`. */
  sections?: SchemaFormSection[];
  /** Grupos de campos lado a lado a partir de `md` (ver `SchemaFormProps`). */
  sideBySide?: string[][];
  /** Chaves de topo fora de seção também num `Card` (formulário de tela). */
  carded?: boolean;
};

/**
 * Campos de um schema de objeto dentro de um formulário externo (`FormProvider` do
 * react-hook-form), sob `prefix`. Rótulos, dicas, `hidden` e `fields` usam o caminho
 * completo, com `*` no lugar dos índices (`blocks.*.content`). A validação é do formulário
 * externo.
 */
export function SchemaFields({
  schema,
  prefix = '',
  labels = {},
  hints = {},
  hidden = [],
  readOnly = [],
  fields = {},
  sections,
  sideBySide = [],
  carded = false,
}: SchemaFieldsProps) {
  const id = useId();
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<FieldValues>();
  const root = describe(schema).node;
  const ctx: Ctx = {
    id,
    register,
    control,
    errors,
    labels,
    hints,
    hidden: new Set(hidden),
    readOnly: new Set(readOnly),
    fields,
    sideBySide,
  };
  if (root.kind !== 'object') {
    return <p className="text-sm text-warning">O gerador espera um schema de objeto.</p>;
  }
  if (prefix !== '') {
    return <Children ctx={ctx} shape={root.shape} prefix={prefix} />;
  }
  const pick = (keys: string[]) =>
    Object.fromEntries(Object.entries(root.shape).filter(([key]) => keys.includes(key)));
  const inSection = new Set((sections ?? []).flatMap((section) => section.paths));
  // Chave de topo fora de todas as seções: depois delas, nunca omitida. No formulário de tela,
  // num `Card` sem título (o único, sem seções), se alguma for visível.
  const rest = Object.keys(root.shape).filter((key) => !inSection.has(key));
  const restFields = <Children ctx={ctx} shape={pick(rest)} prefix="" />;
  return (
    <>
      {(sections ?? []).map((section) => (
        <section key={section.id} aria-labelledby={`secao-${section.id}`}>
          <Card>
            {/* O `h4 mb-6` do Ecme no visual, `h2` na estrutura (o `h1` é o da tela). */}
            <h2
              id={`secao-${section.id}`}
              className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100"
            >
              {section.title}
            </h2>
            <Children ctx={ctx} shape={pick(section.paths)} prefix="" />
          </Card>
        </section>
      ))}
      {carded && rest.some((key) => !ctx.hidden.has(key)) ? <Card>{restFields}</Card> : restFields}
    </>
  );
}

/** Formulário gerado do schema; `onSubmit` recebe o valor já validado pelo schema. */
export function SchemaForm<T>({
  schema,
  defaultValues,
  labels,
  hints,
  hidden,
  readOnly,
  fields,
  sections,
  sideBySide,
  actionBar,
  contentClassName,
  submitLabel,
  pendingLabel = 'Salvando…',
  submitDisabled = false,
  submitDescribedBy,
  onSubmit,
}: SchemaFormProps<T>) {
  // Recusa do servidor sem `path`; os erros de campo vêm de `formState.errors`.
  const [general, setGeneral] = useState<string[]>([]);
  const resolver = zodResolver(
    z
      .unknown()
      .transform((value) => clean(schema, value))
      .pipe(schema) as unknown as z.ZodType<FieldValues, FieldValues>,
  );
  const form = useForm<FieldValues>({ resolver, defaultValues });
  const { isSubmitting, errors } = form.formState;
  const items = errorItems(errors, schema, new Set(Object.keys(fields ?? {})));

  const submit = (
    <Button
      type="submit"
      variant="solid"
      disabled={submitDisabled || isSubmitting}
      aria-describedby={submitDescribedBy}
    >
      {isSubmitting ? pendingLabel : submitLabel}
    </Button>
  );

  return (
    <FormProvider {...form}>
      <Form
        noValidate
        containerClassName="flex flex-col"
        onSubmit={(event) => {
          // Um envio por vez: Enter num campo durante o envio também não dispara outro.
          if (isSubmitting) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(
            async (value) => {
              setGeneral([]);
              const outcome = await onSubmit(value as T);
              if (outcome !== undefined && 'success' in outcome) {
                pushSuccess(outcome.success);
                return;
              }
              setGeneral(applyServerIssues(form.setError, outcome ?? []));
            },
            () => setGeneral([]),
          )(event);
        }}
      >
        <div className={classNames('flex flex-col gap-4', contentClassName)}>
          {sections && (
            <nav aria-label="Seções do formulário">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#secao-${section.id}`} className="underline underline-offset-4">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <ErrorSummary
            lines={general}
            items={items.map((item) => ({
              key: item.path,
              text: `${summaryLabel(labels ?? {}, item.path)}: ${item.message}`,
              onFocus: item.focusable ? () => form.setFocus(item.path) : undefined,
            }))}
          />
          <SchemaFields
            schema={schema}
            labels={labels}
            hints={hints}
            hidden={hidden}
            readOnly={readOnly}
            fields={fields}
            sections={sections}
            sideBySide={sideBySide}
            carded={actionBar !== undefined}
          />
          {actionBar === undefined && <div>{submit}</div>}
        </div>
        {actionBar && (
          <FormActionBar
            {...actionBar}
            contentClassName={contentClassName}
            pending={isSubmitting}
            submit={submit}
          />
        )}
      </Form>
    </FormProvider>
  );
}

/**
 * Barra fixa do formulário de tela, como a do `CustomerCreate`/`CustomerEdit`: a ação
 * secundária à esquerda ("Voltar") ou ao lado do envio ("Descartar"), o envio à direita. O
 * conteúdo acompanha os gutters do `main` e a largura da coluna de cartões.
 */
function FormActionBar({
  kind,
  href,
  contentClassName,
  pending,
  submit,
}: SchemaFormActionBar & { contentClassName?: string; pending: boolean; submit: ReactNode }) {
  const router = useRouter();
  const [discarding, setDiscarding] = useState(false);
  return (
    <BottomStickyBar>
      <div className={PAGE_CONTAINER_GUTTER_X}>
        <div className={classNames('flex items-center justify-between gap-3', contentClassName)}>
          {kind === 'edit' ? (
            <Button asElement={Link} href={href} variant="plain" icon={<TbArrowNarrowLeft />}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {kind === 'create' && (
              <Button
                type="button"
                customColorClass={dangerButtonClass}
                icon={<TbTrash />}
                disabled={pending}
                onClick={() => setDiscarding(true)}
              >
                Descartar
              </Button>
            )}
            {submit}
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={discarding}
        type="danger"
        title="Descartar o que foi preenchido?"
        confirmText="Descartar"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false);
          router.push(href);
        }}
      >
        <p>Nada é salvo, e você volta para a tela anterior.</p>
      </ConfirmDialog>
    </BottomStickyBar>
  );
}
