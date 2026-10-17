'use client';

import type { ThemeSummary } from '@orakel/tokens';
import { useState } from 'react';

import { Button } from '@/components/legacy-ui/button';
import { Checkbox } from '@/components/legacy-ui/checkbox';
import { Input } from '@/components/legacy-ui/input';
import { Textarea } from '@/components/legacy-ui/textarea';

import type { FieldProps, FieldRenderer } from './schema-form.tsx';

// Campos do gerador para o que o schema da configuração do site não desenha sozinho: listas
// de texto (um item por linha), feature flags (registro nome → ligado), escolha entre opções
// que vêm dos recursos da release, não do schema, e o tema com amostra. O valor é sempre o
// da SiteConfig.

const selectClass =
  'flex min-h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm aria-invalid:border-destructive';

const toLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/**
 * Lista de textos, um por linha (domínios, user-agents). O texto digitado fica no campo; só
 * o valor enviado é a lista, sem linhas em branco.
 */
export function linesField({ rows = 3 }: { rows?: number } = {}): FieldRenderer {
  function LinesRenderer(props: FieldProps) {
    return <LinesField {...props} rows={rows} />;
  }
  return LinesRenderer;
}

// O renderizador é chamado como função; o estado do texto fica num componente de verdade.
function LinesField({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  ref,
  readOnly,
  rows,
}: FieldProps & { rows: number }) {
  const [text, setText] = useState(() => (Array.isArray(value) ? value.join('\n') : ''));
  return (
    <Textarea
      id={id}
      ref={ref}
      rows={rows}
      readOnly={readOnly}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(toLines(event.target.value));
      }}
    />
  );
}

type FlagRow = { key: number; name: string; enabled: boolean };

/** Feature flags: pares nome/ligado, com adicionar e remover; envia o registro. */
export function flagsField(): FieldRenderer {
  function FlagsRenderer(props: FieldProps) {
    return <FlagsField {...props} />;
  }
  return FlagsRenderer;
}

function FlagsField({ id, label, value, onChange, invalid, describedBy, ref }: FieldProps) {
  const [rows, setRows] = useState<FlagRow[]>(() =>
    Object.entries((value ?? {}) as Record<string, boolean>).map(([name, enabled], key) => ({
      key,
      name,
      enabled,
    })),
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const update = (next: FlagRow[]) => {
    setRows(next);
    onChange(
      Object.fromEntries(
        next.filter((row) => row.name.trim() !== '').map((row) => [row.name.trim(), row.enabled]),
      ),
    );
  };
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="space-y-3"
    >
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum recurso configurado.</p>
      )}
      {rows.map((row, index) => (
        <div key={row.key} className="flex flex-wrap items-center gap-3">
          <Input
            aria-label={`Nome do recurso ${index + 1}`}
            className="max-w-xs"
            value={row.name}
            onChange={(event) =>
              update(rows.map((r) => (r.key === row.key ? { ...r, name: event.target.value } : r)))
            }
          />
          <label className="flex min-h-6 items-center gap-2 text-sm">
            <Checkbox
              checked={row.enabled}
              onChange={(event) =>
                update(
                  rows.map((r) =>
                    r.key === row.key ? { ...r, enabled: event.target.checked } : r,
                  ),
                )
              }
            />
            Ligado
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update(rows.filter((r) => r.key !== row.key))}
          >
            Remover recurso {index + 1}
          </Button>
        </div>
      ))}
      <Button
        ref={ref}
        variant="outline"
        size="sm"
        onClick={() => {
          setNextKey(nextKey + 1);
          update([...rows, { key: nextKey, name: '', enabled: true }]);
        }}
      >
        Adicionar recurso
      </Button>
    </div>
  );
}

/** Escolha entre opções recebidas em tempo de execução (presets e variantes de RESOURCES). */
export function choiceField(options: readonly string[]): FieldRenderer {
  function ChoiceField({ id, value, onChange, invalid, describedBy, ref }: FieldProps) {
    return (
      <select
        id={id}
        ref={ref}
        className={selectClass}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return ChoiceField;
}

/**
 * Tema: um rádio por tema recebido (THEME_SUMMARIES, montado no servidor; o pacote não entra
 * no bundle do navegador), com a amostra de fundo, texto e destaque e o nome legível. O `ref`
 * vai no rádio marcado (ou no primeiro), para o foco do erro chegar ao grupo.
 */
export function themeField(themes: readonly ThemeSummary[]): FieldRenderer {
  function ThemeField({ id, name, label, value, onChange, invalid, describedBy, ref }: FieldProps) {
    const selected = typeof value === 'string' ? value : '';
    const focusable = Math.max(
      0,
      themes.findIndex((theme) => theme.id === selected),
    );
    return (
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="grid gap-2 sm:grid-cols-2"
      >
        {themes.map((theme, index) => (
          <label
            key={theme.id}
            className="flex min-h-11 items-center gap-3 rounded-md border border-border p-3 text-sm has-checked:border-primary"
          >
            <input
              type="radio"
              name={name}
              value={theme.id}
              ref={index === focusable ? ref : undefined}
              checked={selected === theme.id}
              onChange={() => onChange(theme.id)}
              className="size-4 shrink-0 accent-primary"
            />
            <span aria-hidden="true" className="flex shrink-0 -space-x-1">
              {[theme.colors.background, theme.colors.text, theme.colors.accent].map(
                (color, swatch) => (
                  <span
                    key={swatch}
                    data-swatch={color}
                    className="size-5 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ),
              )}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">{theme.name}</span>
              <span className="text-muted-foreground">{theme.id}</span>
            </span>
          </label>
        ))}
      </div>
    );
  }
  return ThemeField;
}
