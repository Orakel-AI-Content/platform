'use client';

import { Checkbox } from '@/components/ui/checkbox';

import type { FieldProps, FieldRenderer } from './schema-form.tsx';

// Seletores do gerador para referências do site: mídia (um ID) e entidades (lista de IDs).
// Só escolhem entre o que já existe; criar mídia ou entidade é de outras telas.

export type PickerOption = { id: number; label: string };

const selectClass =
  'flex min-h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 aria-invalid:border-destructive';

/**
 * Uma mídia do site (`mediaId`, `coverMediaId`). Opcional: a opção vazia vira `undefined`;
 * obrigatória: a vazia só pede a escolha, e o schema recusa se ficar assim.
 */
export function mediaField(
  options: readonly PickerOption[],
  { optional = false }: { optional?: boolean } = {},
): FieldRenderer {
  function MediaField({ id, value, onChange, invalid, describedBy, ref }: FieldProps) {
    return (
      <select
        id={id}
        ref={ref}
        className={selectClass}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : Number(event.target.value))
        }
      >
        <option value="">{optional ? 'Nenhuma' : 'Escolha uma mídia'}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return MediaField;
}

/** Várias entidades do site (`authorIds`, `taxonomyIds`) por caixas de seleção nativas. */
export function entityField(options: readonly PickerOption[], empty: string): FieldRenderer {
  function EntityField({ id, label, value, onChange, invalid, describedBy }: FieldProps) {
    const selected = new Set(Array.isArray(value) ? (value as number[]) : []);
    if (options.length === 0) {
      return (
        <p id={id} className="text-sm text-muted-foreground">
          {empty}
        </p>
      );
    }
    return (
      <div
        id={id}
        role="group"
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {options.map((option) => (
          <label key={option.id} className="flex min-h-6 items-center gap-2 text-sm">
            <Checkbox
              checked={selected.has(option.id)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(option.id);
                else next.delete(option.id);
                // Ordem estável: a das opções.
                onChange(options.map((o) => o.id).filter((optionId) => next.has(optionId)));
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  return EntityField;
}
