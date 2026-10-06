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

import { clean, describe, emptyValue, pattern } from './schema-walk.ts';

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
  submitLabel: string;
  /**
   * Recebe o valor validado pelo schema. Pode devolver a recusa do servidor: cada issue com
   * `path` vira erro do campo; sem `path`, vai para o resumo.
   */
  onSubmit: (value: T) => SubmitOutcome | Promise<SubmitOutcome>;
};

/** Recusa do servidor (serializável; `path` aponta o campo). */
export type SchemaFormIssue = { path: (string | number)[]; message: string };

type SubmitOutcome = void | readonly SchemaFormIssue[];

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
  'flex min-h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:border-destructive';

/** Primeira mensagem de erro sob um caminho (o erro pode estar num item interno). */
function messageAt(errors: FieldErrors<FieldValues>, path: string): string | undefined {
  const find = (node: unknown): string | undefined => {
    if (node === null || typeof node !== 'object') return undefined;
    if ('message' in node && typeof node.message === 'string' && node.message !== '') {
      return node.message;
    }
    for (const child of Object.values(node)) {
      const message = find(child);
      if (message) return message;
    }
    return undefined;
  };
  return find(get(errors, path));
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
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${fieldId}-error`} className="text-xs text-destructive">
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
            <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
              {hint}
            </p>
          )}
          {message && (
            <p id={`${fieldId}-error`} className="text-xs text-destructive">
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
      {typeof message === 'string' && <p className="text-xs text-destructive">{message}</p>}
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
  return root.kind === 'object' ? (
    <Children ctx={ctx} shape={root.shape} prefix={prefix} />
  ) : (
    <p className="text-sm text-warning">O gerador espera um schema de objeto.</p>
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
  submitLabel,
  onSubmit,
}: SchemaFormProps<T>) {
  const [summary, setSummary] = useState<string[]>([]);
  const resolver = zodResolver(
    z
      .unknown()
      .transform((value) => clean(schema, value))
      .pipe(schema) as unknown as z.ZodType<FieldValues, FieldValues>,
  );
  const form = useForm<FieldValues>({ resolver, defaultValues });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) =>
          void form.handleSubmit(
            async (value) => {
              setSummary([]);
              const issues = (await onSubmit(value as T)) ?? [];
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
              if (issues.length > 0) {
                setSummary(top.length > 0 ? top : ['Corrija os campos destacados.']);
              }
            },
            () => setSummary(['Corrija os campos destacados.']),
          )(event)
        }
      >
        <div role="alert" className={cn(summary.length > 0 && 'text-sm text-destructive')}>
          {summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <SchemaFields
          schema={schema}
          labels={labels}
          hints={hints}
          hidden={hidden}
          readOnly={readOnly}
          fields={fields}
        />
        <Button type="submit">{submitLabel}</Button>
      </form>
    </FormProvider>
  );
}
