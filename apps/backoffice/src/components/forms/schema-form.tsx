'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState, type ReactNode } from 'react';
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

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { clean, describe, emptyValue, pattern, type FieldNode } from './schema-walk.ts';

// Gerador de formulários a partir de um schema Zod de objeto (padrão do Backoffice,
// docs/design/design-system.md). Desenha texto, número, booleano, enum, objeto e lista de
// objetos; o resto (rich text, seletores de mídia e de entidade) entra pelo registro de
// campos, por caminho com `*` no lugar dos índices. A validação é só a do schema.

/** Props de um campo registrado: valor e mudança vêm do react-hook-form (Controller). */
export type FieldProps = {
  id: string;
  name: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  describedBy: string | undefined;
  /** Ligue ao controle focável: o foco do erro (inclusive do servidor) chega até ele. */
  ref: (element: HTMLElement | null) => void;
  /** Caminho em `readOnly`: mostre o valor sem permitir mudança. */
  readOnly: boolean;
};

export type FieldRenderer = (props: FieldProps) => ReactNode;

/** Grupo de chaves de topo do schema, com título; `id` vira a âncora `#secao-<id>`. */
export type SchemaFormSection = { id: string; title: string; paths: string[] };

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
   * mostrada ao lado do botão.
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
};

const selectClass =
  'flex min-h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm aria-invalid:border-destructive';

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

/** Rótulo, controle, dica e erro ligados por id e aria-describedby. */
function Field({
  ctx,
  path,
  label,
  children,
}: {
  ctx: Ctx;
  path: string;
  label: string;
  children: (props: { id: string; invalid: boolean; describedBy: string | undefined }) => ReactNode;
}) {
  const fieldId = `${ctx.id}-${path}`;
  const hint = ctx.hints[pattern(path)];
  const message = messageAt(ctx.errors, path);
  const describedBy =
    [hint ? `${fieldId}-hint` : '', message ? `${fieldId}-error` : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      {children({ id: fieldId, invalid: message !== undefined, describedBy })}
      {hint && (
        <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${fieldId}-error`} className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
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

  const registered = ctx.fields[pattern(path)];
  if (registered) {
    return (
      <Field ctx={ctx} path={path} label={label}>
        {({ id, invalid, describedBy }) => (
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
  const aria = (invalid: boolean, describedBy: string | undefined) => ({
    'aria-invalid': invalid,
    'aria-describedby': describedBy,
  });
  switch (node.kind) {
    case 'literal':
      return null;
    case 'string':
      return (
        <Field ctx={ctx} path={path} label={label}>
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              readOnly={ctx.readOnly.has(pattern(path))}
              {...aria(invalid, describedBy)}
              {...ctx.register(path)}
            />
          )}
        </Field>
      );
    case 'number':
      return (
        <Field ctx={ctx} path={path} label={label}>
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              {...aria(invalid, describedBy)}
              {...ctx.register(path, { valueAsNumber: true })}
            />
          )}
        </Field>
      );
    case 'enum':
      return (
        <Field ctx={ctx} path={path} label={label}>
          {({ id, invalid, describedBy }) => (
            <select
              id={id}
              className={selectClass}
              {...aria(invalid, describedBy)}
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
    case 'boolean': {
      const fieldId = `${ctx.id}-${path}`;
      const message = messageAt(ctx.errors, path);
      const hint = ctx.hints[pattern(path)];
      const describedBy =
        [hint ? `${fieldId}-hint` : '', message ? `${fieldId}-error` : '']
          .filter(Boolean)
          .join(' ') || undefined;
      return (
        <div className="space-y-1.5">
          <label htmlFor={fieldId} className="flex min-h-6 items-center gap-2 text-sm">
            <Checkbox
              id={fieldId}
              {...aria(message !== undefined, describedBy)}
              {...ctx.register(path)}
            />
            {label}
          </label>
          {hint && (
            <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
              {hint}
            </p>
          )}
          {message && (
            <p id={`${fieldId}-error`} className="text-sm text-destructive">
              {message}
            </p>
          )}
        </div>
      );
    }
    case 'object':
      return (
        <fieldset className="space-y-4 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{label}</legend>
          <Children ctx={ctx} shape={node.shape} prefix={path} />
        </fieldset>
      );
    case 'array':
      return <ArrayField ctx={ctx} element={node.element} path={path} label={label} />;
    default:
      // Sem desenho padrão e sem campo registrado: aviso visível, nunca omissão silenciosa.
      return (
        <p className="rounded-md border border-warning p-2 text-sm text-warning">
          {label}: sem editor para este campo (registre um campo para {pattern(path)}).
        </p>
      );
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
  return (
    <>
      {Object.entries(shape).map(([key, child]) => {
        const path = prefix === '' ? key : `${prefix}.${key}`;
        return <Node key={path} ctx={ctx} schema={child} path={path} name={key} />;
      })}
    </>
  );
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
  const itemNode = describe(element).node;
  const itemLabel = ctx.labels[`${pattern(path)}.*`] ?? 'item';
  const arrayError = get(ctx.errors, path) as
    { message?: string; root?: { message?: string } } | undefined;
  const message = arrayError?.root?.message ?? arrayError?.message;
  if (itemNode.kind !== 'object') {
    return (
      <p className="rounded-md border border-warning p-2 text-sm text-warning">
        {label}: sem editor para este campo (registre um campo para {pattern(path)}).
      </p>
    );
  }
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      {fields.map((item, index) => (
        <fieldset key={item.id} className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm">{`${itemLabel} ${index + 1}`}</legend>
          <Children ctx={ctx} shape={itemNode.shape} prefix={`${path}.${index}`} />
          <Button variant="ghost" size="sm" onClick={() => remove(index)}>
            {`Remover ${itemLabel} ${index + 1}`}
          </Button>
        </fieldset>
      ))}
      {typeof message === 'string' && <p className="text-sm text-destructive">{message}</p>}
      <Button variant="outline" size="sm" onClick={() => append(emptyValue(element))}>
        {`Adicionar ${itemLabel}`}
      </Button>
    </fieldset>
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
  };
  if (root.kind !== 'object') {
    return <p className="text-sm text-warning">O gerador espera um schema de objeto.</p>;
  }
  if (sections === undefined || prefix !== '') {
    return <Children ctx={ctx} shape={root.shape} prefix={prefix} />;
  }
  const pick = (keys: string[]) =>
    Object.fromEntries(Object.entries(root.shape).filter(([key]) => keys.includes(key)));
  const inSection = new Set(sections.flatMap((section) => section.paths));
  return (
    <>
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`secao-${section.id}`}
          className="space-y-4 pt-2"
        >
          <h2 id={`secao-${section.id}`} className="text-lg font-semibold">
            {section.title}
          </h2>
          <Children ctx={ctx} shape={pick(section.paths)} prefix="" />
        </section>
      ))}
      {/* Chave de topo fora de todas as seções: depois delas, nunca omitida. */}
      <Children
        ctx={ctx}
        shape={pick(Object.keys(root.shape).filter((key) => !inSection.has(key)))}
        prefix=""
      />
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
  submitLabel,
  pendingLabel = 'Salvando…',
  submitDisabled = false,
  submitDescribedBy,
  onSubmit,
}: SchemaFormProps<T>) {
  // Recusa do servidor sem `path`; os erros de campo vêm de `formState.errors`.
  const [general, setGeneral] = useState<string[]>([]);
  const [success, setSuccess] = useState('');
  const resolver = zodResolver(
    z
      .unknown()
      .transform((value) => clean(schema, value))
      .pipe(schema) as unknown as z.ZodType<FieldValues, FieldValues>,
  );
  const form = useForm<FieldValues>({ resolver, defaultValues });
  const { isSubmitting, errors } = form.formState;
  const items = errorItems(errors, schema, new Set(Object.keys(fields ?? {})));

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          // Um envio por vez: Enter num campo durante o envio também não dispara outro.
          if (isSubmitting) {
            event.preventDefault();
            return;
          }
          void form.handleSubmit(
            async (value) => {
              setGeneral([]);
              setSuccess('');
              const outcome = await onSubmit(value as T);
              if (outcome !== undefined && 'success' in outcome) {
                setSuccess(outcome.success);
                return;
              }
              const issues = outcome ?? [];
              const top: string[] = [];
              let focused = false;
              for (const issue of issues) {
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
              setGeneral(top);
            },
            () => {
              setSuccess('');
              setGeneral([]);
            },
          )(event);
        }}
      >
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
        <div
          role="alert"
          className={cn(
            (general.length > 0 || items.length > 0) && 'space-y-1 text-sm text-destructive',
          )}
        >
          {general.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {items.length > 0 && (
            <>
              <p>Corrija os campos destacados:</p>
              <ul className="list-disc space-y-1 pl-5">
                {items.map((item) => {
                  const text = `${summaryLabel(labels ?? {}, item.path)}: ${item.message}`;
                  return (
                    <li key={item.path}>
                      {item.focusable ? (
                        <button
                          type="button"
                          className="text-left underline underline-offset-4"
                          onClick={() => form.setFocus(item.path)}
                        >
                          {text}
                        </button>
                      ) : (
                        text
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <SchemaFields
          schema={schema}
          labels={labels}
          hints={hints}
          hidden={hidden}
          readOnly={readOnly}
          fields={fields}
          sections={sections}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={submitDisabled || isSubmitting}
            aria-describedby={submitDescribedBy}
          >
            {isSubmitting ? pendingLabel : submitLabel}
          </Button>
          <p role="status" className="text-sm text-success">
            {success}
          </p>
        </div>
      </form>
    </FormProvider>
  );
}
