'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { SiteConfig } from '@orakel/content-model/v1';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { get, useFieldArray, useForm, type FieldErrors } from 'react-hook-form';

import {
  fieldForPath,
  SiteConfigFormSchema,
  type FormField,
  type SiteConfigFormValues,
  type SiteFormResult,
} from '@/components/site-config-form-values.ts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Options = { presets: Record<string, string[]>; variants: Record<string, string[]> };

const PAGE_TYPE_LABEL: Record<string, string> = {
  home: 'Home',
  artigo: 'Artigo',
  categoria: 'Categoria',
  autor: 'Autor',
};
const VARIANT_LABEL: Record<string, string> = { articleCard: 'Card de artigo' };

const selectClass =
  'flex min-h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:border-destructive';

/** Primeira mensagem de erro de um campo (o erro pode estar num item da lista). */
function messageFor(errors: FieldErrors<SiteConfigFormValues>, name: string): string | undefined {
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
  return find(get(errors, name));
}

/**
 * Formulário da configuração do site, para o cadastro e a edição (na edição o SITE_ID não
 * muda). Valida pelo SiteConfigSchema antes de enviar; a Server Action só delega ao domínio,
 * e as issues dele voltam para o campo do `path` ou para o topo, anunciadas por role=alert.
 */
export function SiteConfigForm({
  mode,
  defaultValues,
  options,
  action,
}: {
  mode: 'create' | 'edit';
  defaultValues: SiteConfigFormValues;
  options: Options;
  action: (config: SiteConfig) => Promise<SiteFormResult>;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SiteConfigFormValues, unknown, SiteConfig>({
    resolver: zodResolver(SiteConfigFormSchema),
    defaultValues,
  });
  const flags = useFieldArray({ control, name: 'featureFlags' });

  const onValid = (config: SiteConfig) =>
    startTransition(async () => {
      setSummary([]);
      setStatus('');
      const result = await action(config);
      if (result.ok) {
        if (mode === 'create') {
          router.push('/sites');
          router.refresh();
        } else {
          setStatus(result.message);
        }
        return;
      }
      const top: string[] = [];
      let focused = false;
      for (const issue of result.issues) {
        const field = fieldForPath(issue.path);
        if (field) {
          setError(field, { type: 'server', message: issue.message }, { shouldFocus: !focused });
          focused = true;
        } else {
          top.push(issue.message);
        }
      }
      setSummary(top.length > 0 ? top : [result.message]);
    });

  const onInvalid = () => {
    setStatus('');
    setSummary(['Corrija os campos destacados.']);
  };

  /** Campo com rótulo, dica e erro ligados por aria-describedby. */
  const field = (
    name: FormField,
    label: string,
    control: (props: {
      id: string;
      'aria-invalid': boolean;
      'aria-describedby': string | undefined;
    }) => ReactNode,
    hint?: string,
  ) => {
    const fieldId = `${id}-${name}`;
    const message = messageFor(errors, name);
    const described = [hint ? `${fieldId}-hint` : '', message ? `${fieldId}-error` : '']
      .filter(Boolean)
      .join(' ');
    return (
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>{label}</Label>
        {control({
          id: fieldId,
          'aria-invalid': message !== undefined,
          'aria-describedby': described || undefined,
        })}
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
  };

  const select = (name: FormField, label: string, values: string[]) =>
    field(name, label, (props) => (
      <select {...props} className={selectClass} {...register(name)}>
        {values.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    ));

  const fieldsetClass = 'space-y-4 rounded-md border border-border p-4';
  const legendClass = 'px-1 text-sm font-semibold';

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(onValid, onInvalid)(event)}
      className="max-w-2xl space-y-6"
    >
      <div
        role="alert"
        className={cn(summary.length > 0 && 'rounded-md border border-destructive p-3')}
      >
        {summary.length > 0 && (
          <ul className="list-inside list-disc text-sm text-destructive">
            {summary.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Identificação</legend>
        {field(
          'siteId',
          'SITE_ID',
          (props) => (
            <Input {...props} readOnly={mode === 'edit'} {...register('siteId')} />
          ),
          mode === 'edit' ? 'Não muda depois do cadastro.' : 'kebab-case, ex.: meu-site.',
        )}
        {field('name', 'Nome', (props) => (
          <Input {...props} {...register('name')} />
        ))}
        {field(
          'domains',
          'Domínios',
          (props) => (
            <Textarea {...props} rows={3} {...register('domains')} />
          ),
          'Um por linha; o primeiro é o principal.',
        )}
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Idioma e fuso</legend>
        {field(
          'language',
          'Idioma',
          (props) => (
            <Input {...props} {...register('language')} />
          ),
          'Tag BCP 47, ex.: pt-BR.',
        )}
        {field(
          'timeZone',
          'Fuso horário',
          (props) => (
            <Input {...props} {...register('timeZone')} />
          ),
          'Fuso IANA, ex.: America/Sao_Paulo.',
        )}
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Aparência</legend>
        {field(
          'theme',
          'Tema',
          (props) => (
            <Input {...props} {...register('theme')} />
          ),
          'ID do tema em @orakel/tokens.',
        )}
        {Object.entries(options.presets).map(([pageType, values]) =>
          select(
            `presets.${pageType}` as FormField,
            `Preset da página ${PAGE_TYPE_LABEL[pageType] ?? pageType}`,
            values,
          ),
        )}
        {Object.entries(options.variants).map(([component, values]) =>
          select(
            `variants.${component}` as FormField,
            `Variante: ${VARIANT_LABEL[component] ?? component}`,
            values,
          ),
        )}
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Recursos ligados</legend>
        {flags.fields.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum recurso configurado.</p>
        )}
        {flags.fields.map((flag, index) => (
          <div key={flag.id} className="flex flex-wrap items-center gap-3">
            <Input
              aria-label={`Nome do recurso ${index + 1}`}
              className="max-w-xs"
              {...register(`featureFlags.${index}.name`)}
            />
            <label className="flex min-h-6 items-center gap-2 text-sm">
              <Checkbox {...register(`featureFlags.${index}.enabled`)} />
              Ligado
            </label>
            <Button variant="ghost" size="sm" onClick={() => flags.remove(index)}>
              Remover recurso {index + 1}
            </Button>
          </div>
        ))}
        {messageFor(errors, 'featureFlags') && (
          <p className="text-xs text-destructive">{messageFor(errors, 'featureFlags')}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => flags.append({ name: '', enabled: true })}
        >
          Adicionar recurso
        </Button>
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Robôs (robots.txt)</legend>
        {field(
          'crawlers.allow',
          'Permitir também',
          (props) => (
            <Textarea {...props} rows={2} {...register('crawlers.allow')} />
          ),
          'User-agents, um por linha; vazio usa só a lista da plataforma.',
        )}
        {field(
          'crawlers.block',
          'Bloquear também',
          (props) => (
            <Textarea {...props} rows={2} {...register('crawlers.block')} />
          ),
          'User-agents, um por linha.',
        )}
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Integrações e indexação</legend>
        <label className="flex min-h-6 items-center gap-2 text-sm">
          <Checkbox {...register('integrations.ga4.enabled')} />
          GA4 ligado
        </label>
        {field('integrations.ga4.measurementId', 'ID de medição do GA4', (props) => (
          <Input {...props} placeholder="G-XXXX" {...register('integrations.ga4.measurementId')} />
        ))}
        <div className="space-y-1.5">
          <label className="flex min-h-6 items-center gap-2 text-sm">
            <Checkbox
              aria-describedby={`${id}-indexavel-hint`}
              aria-invalid={messageFor(errors, 'indexavel') !== undefined}
              {...register('indexavel')}
            />
            Indexável
          </label>
          <p id={`${id}-indexavel-hint`} className="text-xs text-muted-foreground">
            Desligado: noindex em todas as respostas. Ligar exige o G1 registrado.
          </p>
          {messageFor(errors, 'indexavel') && (
            <p className="text-xs text-destructive">{messageFor(errors, 'indexavel')}</p>
          )}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : mode === 'create' ? 'Cadastrar site' : 'Salvar configuração'}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      </div>
    </form>
  );
}
