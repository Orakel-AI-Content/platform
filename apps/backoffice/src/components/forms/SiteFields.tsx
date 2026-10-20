'use client';

import type { ThemeSummary } from '@orakel/tokens';
import { useState } from 'react';
import type { SelectInstance } from 'react-select';

import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Radio } from '@/components/ui/Radio';
import Select from '@/components/ui/Select';
import { Switcher } from '@/components/ui/Switcher';

import { selectInFormItem, type FieldProps, type FieldRenderer } from './SchemaForm.tsx';

// Campos do gerador para o que o schema da configuração do site não desenha sozinho: listas
// de texto (um item por linha), feature flags (registro nome → ligado), escolha entre opções
// que vêm dos recursos da release, não do schema, e o tema com amostra. O valor é sempre o
// da SiteConfig. Visual do Ecme (#245): `Input` (com `textArea` nas listas), `Switcher` no
// liga/desliga e `Button`; a escolha usa o `Select` do Ecme (#330) e o tema, o `Radio.Group` (#331).

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
  required,
  ref,
  readOnly,
  rows,
}: FieldProps & { rows: number }) {
  const [text, setText] = useState(() => (Array.isArray(value) ? value.join('\n') : ''));
  return (
    <Input
      textArea
      id={id}
      // O `ref` do Input do Ecme também admite um componente (`asElement`); o foco do erro só
      // precisa do elemento do DOM.
      ref={(element) => ref(element instanceof HTMLElement ? element : null)}
      rows={rows}
      readOnly={readOnly}
      aria-invalid={invalid}
      aria-required={required || undefined}
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
  // Remover pede confirmação (#327); a linha fica depois de fechar, para o título não mudar.
  const [removing, setRemoving] = useState({ key: -1, index: 0, open: false });
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
      {rows.length === 0 && <p className="text-sm">Nenhum recurso configurado.</p>}
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
          <Switcher
            aria-label={`Recurso ${index + 1} ligado`}
            checked={row.enabled}
            onChange={(checked) =>
              update(rows.map((r) => (r.key === row.key ? { ...r, enabled: checked } : r)))
            }
          />
          <Button
            type="button"
            size="sm"
            customColorClass={dangerButtonClass}
            onClick={() => setRemoving({ key: row.key, index, open: true })}
          >
            Remover recurso {index + 1}
          </Button>
        </div>
      ))}
      <ConfirmDialog
        isOpen={removing.open}
        type="danger"
        title={`Remover recurso ${removing.index + 1}?`}
        confirmText="Remover"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setRemoving({ ...removing, open: false })}
        onConfirm={() => {
          update(rows.filter((r) => r.key !== removing.key));
          setRemoving({ ...removing, open: false });
        }}
      >
        <p>O recurso sai da configuração ao salvar.</p>
      </ConfirmDialog>
      <Button
        ref={ref}
        type="button"
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
  const choices = options.map((option) => ({ value: option, label: option }));
  function ChoiceField({ name, value, onChange, required, ref }: FieldProps) {
    return (
      <Select<{ value: string; label: string }>
        // O foco do erro (inclusive do servidor) cai no campo de texto do combobox.
        field={{ ref: (select: SelectInstance | null) => ref(select?.inputRef ?? null) }}
        name={name}
        options={choices}
        value={choices.find((choice) => choice.value === value) ?? null}
        onChange={(choice) => onChange(choice?.value)}
        required={required}
        placeholder="Escolha"
        components={selectInFormItem}
      />
    );
  }
  return ChoiceField;
}

/**
 * Tema: um `Radio` por tema recebido (THEME_SUMMARIES, montado no servidor; o pacote não entra
 * no bundle do navegador), com a amostra de fundo, texto e destaque e o nome legível. O `ref`
 * vai no rádio marcado (ou no primeiro), para o foco do erro chegar ao grupo.
 */
export function themeField(themes: readonly ThemeSummary[]): FieldRenderer {
  function ThemeField({
    id,
    name,
    label,
    value,
    onChange,
    invalid,
    describedBy,
    required,
    ref,
  }: FieldProps) {
    const selected = typeof value === 'string' ? value : '';
    const focusable = Math.max(
      0,
      themes.findIndex((theme) => theme.id === selected),
    );
    return (
      <Radio.Group
        id={id}
        name={name}
        value={selected}
        onChange={(theme) => onChange(theme)}
        aria-label={label}
        aria-invalid={invalid}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        className="grid gap-2 sm:grid-cols-2"
      >
        {themes.map((theme, index) => (
          <Radio
            key={theme.id}
            value={theme.id}
            ref={index === focusable ? ref : undefined}
            className="min-h-11 rounded-xl border border-gray-200 p-3 text-sm has-checked:border-primary dark:border-gray-700"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className="flex shrink-0 -space-x-1">
                {[theme.colors.background, theme.colors.text, theme.colors.accent].map(
                  (color, swatch) => (
                    <span
                      key={swatch}
                      data-swatch={color}
                      className="size-5 rounded-full border border-gray-200 dark:border-gray-700"
                      style={{ backgroundColor: color }}
                    />
                  ),
                )}
              </span>
              <span className="flex flex-col">
                <span className="font-medium">{theme.name}</span>
                <span>{theme.id}</span>
              </span>
            </span>
          </Radio>
        ))}
      </Radio.Group>
    );
  }
  return ThemeField;
}

/**
 * Liga/desliga de um booleano (indexável) no `Switcher`: o rótulo e a dica são os do `FormItem`,
 * ligados por `id` e `aria-describedby`; envia `true`/`false`.
 */
export function switchField(): FieldRenderer {
  function SwitchField({ id, value, onChange, describedBy, ref, readOnly }: FieldProps) {
    return (
      <Switcher
        id={id}
        ref={ref}
        readOnly={readOnly}
        aria-describedby={describedBy}
        checked={value === true}
        onChange={(checked) => onChange(checked)}
      />
    );
  }
  return SwitchField;
}
