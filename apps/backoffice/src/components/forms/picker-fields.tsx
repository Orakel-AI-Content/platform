'use client';

import { useEffect, useRef, useState } from 'react';

import { MediaThumbnail, type MediaItem } from '@/components/media-library';
import { MediaPicker, type MediaPickerPage } from '@/components/media-picker';
import { Button } from '@/components/legacy-ui/button';
import { Checkbox } from '@/components/legacy-ui/checkbox';

import type { FieldProps, FieldRenderer } from './schema-form.tsx';

// Seletores do gerador para referências do site: mídia (um ID, pela grade de miniaturas) e
// entidades (lista de IDs). Só escolhem entre o que já existe; criar é de outras telas.

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
          <div className="aspect-square rounded-md border border-dashed border-border" />
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
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(Number.NaN);
            // O botão some com o valor: o foco vai para "Escolher imagem".
            trigger.current?.focus();
          }}
        >
          Remover
        </Button>
      )}
    </div>
  );
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
