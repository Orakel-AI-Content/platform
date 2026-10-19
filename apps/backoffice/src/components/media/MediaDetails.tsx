'use client';

import { useId, useState } from 'react';

import { MediaThumbnail, type MediaItem } from '@/components/media/MediaLibrary';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';

// Detalhes de uma imagem da biblioteca (#187): a imagem da grade é um botão que abre o Dialog
// do Ecme (#279), com nome, dimensões, formatos, identificador e data de envio, e "Copiar
// identificador" pela área de transferência. Esc, o fundo ou "Fechar" fecham, e o react-modal
// devolve o foco à imagem. O "Fechar" é o botão explícito ao lado do `h2` (`closable={false}`,
// para não haver dois), e o título fica no corpo em `h2`, em vez do `h5` do `title` do Dialog.

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
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<Copy>(null);
  const formats = (item.formats ?? []).map((format) => FORMAT_LABEL[format] ?? format);

  // Ao fechar, a mensagem da cópia some.
  function close() {
    setOpen(false);
    setCopy(null);
  }

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
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="w-full space-y-1 rounded-md text-left hover:bg-gray-200 dark:hover:bg-gray-800"
      >
        <MediaThumbnail item={item} />
        <span className="block text-xs text-gray-600 dark:text-gray-400">
          {mediaCaption(item, timeZone)}
        </span>
      </button>
      <Dialog isOpen={open} onClose={close} closable={false} aria={{ labelledby: `${id}-title` }}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h2 id={`${id}-title`} className="text-lg font-semibold break-all">
              {mediaName(item)}
            </h2>
            <Button variant="plain" size="sm" onClick={close}>
              Fechar
            </Button>
          </div>
          <div className="w-40">
            <MediaThumbnail item={item} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-600 dark:text-gray-400">Dimensões</dt>
            <dd>
              {item.width}×{item.height} px
            </dd>
            <dt className="text-gray-600 dark:text-gray-400">Formatos disponíveis</dt>
            <dd>{formats.length > 0 ? formats.join(', ') : '—'}</dd>
            <dt className="text-gray-600 dark:text-gray-400">Identificador</dt>
            <dd className="tabular-nums">{item.id}</dd>
            <dt className="text-gray-600 dark:text-gray-400">Enviada em</dt>
            <dd>{mediaUploadedAt(item, timeZone)}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void copyId()}>
              Copiar identificador
            </Button>
            <p role="status" className={copy?.kind === 'error' ? 'text-sm text-error' : 'text-sm'}>
              {copy?.text}
            </p>
          </div>
        </div>
      </Dialog>
    </>
  );
}
