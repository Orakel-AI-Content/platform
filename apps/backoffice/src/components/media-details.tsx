'use client';

import { useId, useRef, useState } from 'react';

import { MediaThumbnail, type MediaItem } from '@/components/media-library';
import { formatDateTime } from '@/components/site-labels.ts';
import { Button } from '@/components/ui/button';

// Detalhes de uma imagem da biblioteca (#187): a imagem da grade é um botão que abre um
// `<dialog>` nativo com `showModal` (sem Radix, como o `MediaPicker`), com nome, dimensões,
// formatos, identificador e data de envio, e "Copiar identificador" pela área de
// transferência. Esc ou "Fechar" devolvem o foco à imagem.

/** Nome original, ou o texto de reserva das mídias sem envio registrado (#186). */
export function mediaName(item: MediaItem): string {
  return item.originalName ?? `Sem nome (Mídia ${item.id})`;
}

/** Data de envio no fuso do site, ou o texto de reserva (#186). */
export function mediaUploadedAt(item: MediaItem, timeZone: string): string {
  return item.uploadedAt
    ? formatDateTime(new Date(item.uploadedAt), timeZone)
    : 'Data de envio não registrada';
}

/** Legenda da imagem na biblioteca: "<nome> · <data>". */
export function mediaCaption(item: MediaItem, timeZone: string): string {
  return `${mediaName(item)} · ${mediaUploadedAt(item, timeZone)}`;
}

const FORMAT_LABEL: Record<string, string> = {
  avif: 'AVIF',
  webp: 'WebP',
  jpeg: 'JPEG',
  png: 'PNG',
};

type Copy = { kind: 'ok' | 'error'; text: string } | null;

export function MediaDetails({ item, timeZone }: { item: MediaItem; timeZone: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [copy, setCopy] = useState<Copy>(null);
  const formats = (item.formats ?? []).map((format) => FORMAT_LABEL[format] ?? format);

  async function copyId() {
    try {
      // `navigator.clipboard` só existe em contexto seguro; sem ele, a falha vira mensagem.
      await navigator.clipboard.writeText(String(item.id));
      setCopy({ kind: 'ok', text: 'Identificador copiado.' });
    } catch {
      setCopy({
        kind: 'error',
        text: `Não foi possível copiar; o identificador é ${item.id}.`,
      });
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="w-full space-y-1 rounded-md text-left hover:bg-muted"
      >
        <MediaThumbnail item={item} />
        <span className="block text-xs text-muted-foreground">{mediaCaption(item, timeZone)}</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        // Esc (cancel) ou "Fechar": o foco volta à imagem, e a mensagem da cópia some.
        onClose={() => {
          setCopy(null);
          trigger.current?.focus();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-border bg-background p-4 text-foreground shadow-md backdrop:bg-black/50"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`${id}-title`} className="text-lg font-semibold break-all">
              {mediaName(item)}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
              Fechar
            </Button>
          </div>
          <div className="w-40">
            <MediaThumbnail item={item} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Dimensões</dt>
            <dd>
              {item.width}×{item.height} px
            </dd>
            <dt className="text-muted-foreground">Formatos disponíveis</dt>
            <dd>{formats.length > 0 ? formats.join(', ') : '—'}</dd>
            <dt className="text-muted-foreground">Identificador</dt>
            <dd className="tabular-nums">{item.id}</dd>
            <dt className="text-muted-foreground">Enviada em</dt>
            <dd>{mediaUploadedAt(item, timeZone)}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => void copyId()}>
              Copiar identificador
            </Button>
            <p
              role="status"
              className={copy?.kind === 'error' ? 'text-sm text-destructive' : 'text-sm'}
            >
              {copy?.text}
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
