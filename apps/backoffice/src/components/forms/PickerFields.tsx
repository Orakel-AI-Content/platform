'use client';

import { useEffect, useRef, useState } from 'react';
import type { SelectInstance } from 'react-select';

import { MediaThumbnail, type MediaItem } from '@/components/media/MediaLibrary';
import { MediaPicker, type MediaPickerPage } from '@/components/media/MediaPicker';
import ConfirmDialog, {
  dangerButtonClass,
  dangerConfirmButtonProps,
} from '@/components/shared/ConfirmDialog.tsx';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';

import { selectInFormItem, type FieldProps, type FieldRenderer } from './SchemaForm.tsx';

// Seletores do gerador para referências do site: mídia (um ID, pela grade de miniaturas) e
// entidades (lista de IDs). Só escolhem entre o que já existe; criar é de outras telas. Visual
// do Ecme (#272): `Button` e `Select` (#330) de `ui/`; o diálogo `MediaPicker` fica para a #50.

export type PickerOption = { id: number; label: string };

/**
 * Biblioteca do site para o campo de mídia (#182): as Server Actions da leitura paginada e por
 * IDs, já ligadas ao site pela página (componentes não importam de `src/app`).
 */
export type MediaSource = {
  load: (page: number) => Promise<MediaPickerPage | null>;
  byIds: (ids: number[]) => Promise<MediaItem[] | null>;
};

/**
 * Uma mídia do site (`mediaId`, `coverMediaId`, `avatarMediaId`): a miniatura do valor atual
 * (lida por ID ao abrir), "Escolher imagem"/"Trocar" pela grade e, quando opcional,
 * "Remover". Obrigatória e vazia, o schema recusa e o erro aparece no campo e no resumo.
 */
export function mediaField(
  source: MediaSource,
  { optional = false }: { optional?: boolean } = {},
): FieldRenderer {
  function MediaFieldRenderer(props: FieldProps) {
    return <MediaField {...props} source={source} optional={optional} />;
  }
  return MediaFieldRenderer;
}

// O renderizador é chamado como função; o estado (miniaturas conhecidas) fica num componente.
function MediaField({
  id,
  label,
  value,
  onChange,
  invalid,
  describedBy,
  ref,
  source,
  optional,
}: FieldProps & { source: MediaSource; optional: boolean }) {
  // `NaN` é o vazio de "Remover": o react-hook-form volta ao valor inicial com `undefined`, e o
  // `clean` do gerador envia `NaN` como ausente.
  const current = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const [known, setKnown] = useState<ReadonlyMap<number, MediaItem>>(new Map());
  const trigger = useRef<HTMLButtonElement | null>(null);
  // "Remover" pede confirmação (#327). Confirmado, o foco vai a "Escolher imagem" no
  // `onAfterClose`, que roda depois de o react-modal devolver o foco ao "Remover" (que some).
  const [removing, setRemoving] = useState(false);
  const removed = useRef(false);
  const item = current === undefined ? undefined : known.get(current);

  // Valor que veio salvo (ou trocado fora da grade): a miniatura vem da leitura por ID.
  useEffect(() => {
    if (current === undefined || known.has(current)) return;
    let active = true;
    void source.byIds([current]).then((found) => {
      const hit = found?.find((media) => media.id === current);
      if (active && hit) setKnown((map) => new Map(map).set(hit.id, hit));
    });
    return () => {
      active = false;
    };
  }, [current, known, source]);

  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="flex flex-wrap items-center gap-3"
    >
      <div className="w-24 shrink-0">
        {item ? (
          <MediaThumbnail item={item} />
        ) : (
          <div className="aspect-square rounded-md border border-dashed border-gray-300 dark:border-gray-600" />
        )}
      </div>
      <p className="text-sm">
        {current === undefined
          ? 'Nenhuma imagem'
          : item
            ? `Mídia ${item.id} · ${item.width}×${item.height}`
            : `Mídia ${current}`}
      </p>
      <MediaPicker
        label={current === undefined ? 'Escolher imagem' : 'Trocar'}
        load={source.load}
        onSelect={(mediaId, chosen) => {
          setKnown((map) => new Map(map).set(mediaId, chosen));
          onChange(mediaId);
        }}
        buttonRef={(element) => {
          trigger.current = element;
          ref(element);
        }}
      />
      {optional && current !== undefined && (
        <Button
          type="button"
          size="sm"
          customColorClass={dangerButtonClass}
          onClick={() => setRemoving(true)}
        >
          Remover
        </Button>
      )}
      <ConfirmDialog
        isOpen={removing}
        type="danger"
        title={`Remover a imagem de ${label}?`}
        confirmText="Remover"
        confirmButtonProps={dangerConfirmButtonProps}
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          removed.current = true;
          onChange(Number.NaN);
          setRemoving(false);
        }}
        onAfterClose={() => {
          if (removed.current) trigger.current?.focus();
          removed.current = false;
        }}
      >
        <p>O campo fica sem imagem; a mídia continua na biblioteca.</p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * Várias entidades do site (`authorIds`, `taxonomyIds`) no `Select` múltiplo do Ecme (#330):
 * entrega os IDs na ordem das opções, como a grade de caixas de seleção de antes.
 */
export function entityField(options: readonly PickerOption[], empty: string): FieldRenderer {
  function EntityField({ id, name, value, onChange, required, ref }: FieldProps) {
    const selected = new Set(Array.isArray(value) ? (value as number[]) : []);
    if (options.length === 0) {
      return (
        <p id={id} className="text-sm">
          {empty}
        </p>
      );
    }
    return (
      <Select<PickerOption, true>
        isMulti
        // O foco do erro (inclusive do servidor) cai no campo de texto do combobox.
        field={{
          ref: (select: SelectInstance<PickerOption, true> | null) => ref(select?.inputRef ?? null),
        }}
        name={name}
        options={options}
        getOptionValue={(option) => String(option.id)}
        value={options.filter((option) => selected.has(option.id))}
        onChange={(chosen) => {
          const next = new Set(chosen.map((option) => option.id));
          // Ordem estável: a das opções.
          onChange(options.map((o) => o.id).filter((optionId) => next.has(optionId)));
        }}
        required={required}
        placeholder="Escolha"
        noOptionsMessage={() => 'Nenhuma opção'}
        components={selectInFormItem}
      />
    );
  }
  return EntityField;
}
