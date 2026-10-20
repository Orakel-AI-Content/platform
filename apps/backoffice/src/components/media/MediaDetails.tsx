'use client';

import { useId, useState } from 'react';

import { MediaThumbnail, type MediaItem } from '@/components/media/MediaLibrary';
import { MediaTile } from '@/components/media/MediaTile';
import { ActionAlert, useActionResult } from '@/components/shared/ActionFeedback.tsx';
import { InfoField, InfoList } from '@/components/shared/InfoList.tsx';
import { formatDateTime } from '@/components/shared/siteLabels.ts';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';

// Detalhes de uma imagem da biblioteca (#187): a imagem da grade é um botão que abre o Dialog
// do Ecme (#279), com nome, dimensões, formatos, identificador e data de envio, e "Copiar
// identificador" pela área de transferência, no retorno padrão: o sucesso vai para o toast (o
// ToastProvider fica fora da app e continua anunciado com o diálogo aberto) e a falha para o
// Alert dentro do diálogo. Esc, o fundo ou o X "Fechar" do Dialog fecham, e o react-modal
// devolve o foco à imagem. O título fica no corpo em `h4`, como o `UploadFile` do FileManager
// do Ecme (#374), em vez do `h5` do `title` do Dialog, que não aceita o `break-all`. A imagem
// da grade é a `MediaTile`, a mesma do seletor. Os dados ficam na lista de dados compartilhada
// (#368), numa coluna.

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

export function MediaDetails({ item, timeZone }: { item: MediaItem; timeZone: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const copy = useActionResult();
  const formats = (item.formats ?? []).map((format) => FORMAT_LABEL[format] ?? format);

  // Ao fechar, o erro da cópia some.
  function close() {
    setOpen(false);
    copy.fail(null);
  }

  function copyId() {
    copy.run(async () => {
      try {
        // `navigator.clipboard` só existe em contexto seguro; sem ele, a falha vira mensagem.
        await navigator.clipboard.writeText(String(item.id));
        return { ok: true, message: 'Identificador copiado.' };
      } catch {
        return { ok: false, message: `Não foi possível copiar; o identificador é ${item.id}.` };
      }
    });
  }

  return (
    <>
      <MediaTile item={item} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {mediaCaption(item, timeZone)}
      </MediaTile>
      <Dialog isOpen={open} onClose={close} aria={{ labelledby: `${id}-title` }}>
        <div className="space-y-4">
          {/* Recuo à direita: o nome longo quebra antes de passar sob o X do Dialog. */}
          <h4 id={`${id}-title`} className="pe-8 break-all">
            {mediaName(item)}
          </h4>
          <div className="w-40">
            <MediaThumbnail item={item} />
          </div>
          <InfoList>
            <InfoField label="Dimensões">
              {item.width}×{item.height} px
            </InfoField>
            <InfoField label="Formatos disponíveis">
              {formats.length > 0 ? formats.join(', ') : '—'}
            </InfoField>
            <InfoField label="Identificador" className="tabular-nums">
              {item.id}
            </InfoField>
            <InfoField label="Enviada em">{mediaUploadedAt(item, timeZone)}</InfoField>
          </InfoList>
          <div className="space-y-3">
            <Button size="sm" onClick={copyId}>
              Copiar identificador
            </Button>
            <ActionAlert error={copy.error} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
