'use client';

import { useCallback, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';

import { ListPagination, ListToolbar } from '@/components/list-controls.tsx';
import { MediaDetails } from '@/components/media-details';
import {
  UploadList,
  useUploadQueue,
  xhrSend,
  type SendFile,
  type UploadStatus,
} from '@/components/upload-queue';
import { useListState, type ListConfig } from '@/components/list-state.ts';
import type { MediaPickerPage } from '@/components/media-picker';
import { Button } from '@/components/legacy-ui/button';
import { Input } from '@/components/legacy-ui/input';
import { Label } from '@/components/legacy-ui/label';
import { cn } from '@/lib/utils';

// Biblioteca de mídia do site (#52, #186, #188): envio de várias imagens pela fila (escolher
// no campo ou soltar sobre a biblioteca), com o resultado de cada arquivo, e a grade paginada
// no servidor, com busca por nome, nome e data de envio de cada imagem e as miniaturas de
// media.<domínio>. Busca e página ficam na URL (`q`, `pagina`).

/** Mídia na grade: a miniatura já resolvida para o endereço de mídia do site. */
export type MediaItem = {
  id: number;
  width: number;
  height: number;
  /** Formatos preferidos, em `<source>`, antes do `src` de reserva. */
  sources: { type: string; url: string }[];
  src: string;
  /** Nome original do arquivo enviado (#186); `null` sem envio registrado. */
  originalName?: string | null;
  /** Data do envio em ISO (#186); `null` sem envio registrado. */
  uploadedAt?: string | null;
  /** Formatos distintos das variantes, em ordem alfabética (#187). */
  formats?: string[];
};

/**
 * Miniatura quadrada de uma mídia (#181): formatos preferidos em `<source>` e a reserva na
 * `<img>`. A mesma na biblioteca e na grade do editor; o texto fica com quem a usa.
 */
export function MediaThumbnail({ item }: { item: MediaItem }) {
  return (
    <picture>
      {item.sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.url} />
      ))}
      <img
        src={item.src}
        alt=""
        width={item.width}
        height={item.height}
        loading="lazy"
        className="aspect-square w-full rounded-md border border-border object-cover"
      />
    </picture>
  );
}

/** Formatos que a rota aceita (a assinatura do arquivo é conferida no domínio). */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/** Lista sem filtros nem ordenação: só a busca e a página da URL (`list-state`). */
const MEDIA_LIST: ListConfig = { filters: [], sortable: [] };

export function MediaLibrary({
  siteId,
  timeZone,
  items: initialItems,
  total: initialTotal,
  page,
  pageSize,
  search,
  canWrite,
  refresh,
  uploadStatus,
  send,
  pollMs = 2000,
  timeoutMs = 120_000,
}: {
  siteId: string;
  /** Fuso IANA do site: a data de envio aparece nele. */
  timeZone: string;
  /** A página atual, lida no servidor. */
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  canWrite: boolean;
  /** Relê a página atual (com a busca); `null` se a leitura foi recusada. */
  refresh: (siteId: string, page: number, search: string) => Promise<MediaPickerPage | null>;
  /** Estado dos envios pelas chaves (#188); `null` se a leitura foi recusada. */
  uploadStatus: (siteId: string, keys: string[]) => Promise<UploadStatus[] | null>;
  /** Subida de um arquivo; por padrão, XHR para a rota de envio. */
  send?: SendFile;
  pollMs?: number;
  timeoutMs?: number;
}) {
  const list = useListState(MEDIA_LIST);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Imagem pronta: relê a página atual para ela aparecer na grade.
  const reload = useCallback(() => {
    void refresh(siteId, page, search)
      .then((next) => {
        if (next === null) return;
        setItems(next.items);
        setTotal(next.total);
      })
      .catch(() => undefined);
  }, [refresh, siteId, page, search]);
  const sendFile = useMemo(() => send ?? xhrSend(siteId), [send, siteId]);
  const status = useCallback(
    (keys: string[]) => uploadStatus(siteId, keys),
    [uploadStatus, siteId],
  );
  const queue = useUploadQueue({ send: sendFile, status, onReady: reload, pollMs, timeoutMs });

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    queue.add([...(fileInput.current?.files ?? [])]);
    event.currentTarget.reset();
  }

  // Soltar arquivos sobre a biblioteca envia como o campo; o destaque marca a área de soltar.
  const dropProps = canWrite
    ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          queue.add([...event.dataTransfer.files]);
        },
      }
    : {};

  return (
    <div
      {...dropProps}
      data-dragging={dragging || undefined}
      className={cn(
        'space-y-6 rounded-md border-2 border-dashed border-transparent',
        dragging && 'border-primary bg-muted',
      )}
    >
      {canWrite && (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="media-file">
              Imagens (JPEG, PNG, WebP ou AVIF, até 25 MB cada; ou solte aqui)
            </Label>
            <Input id="media-file" ref={fileInput} type="file" accept={ACCEPT} multiple required />
          </div>
          <Button type="submit">Enviar imagens</Button>
        </form>
      )}
      <UploadList entries={queue.entries} notice={queue.notice} />
      <ListToolbar
        search={search}
        searchLabel="Buscar por nome do arquivo"
        onSearchChange={list.setSearch}
        onClear={list.clearFilters}
      />
      <ul
        aria-label="Imagens do site"
        className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4"
      >
        {items.map((item) => (
          <li key={item.id}>
            <MediaDetails item={item} timeZone={timeZone} />
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {search === '' ? 'Nenhuma imagem na biblioteca.' : 'Nenhuma imagem com esse nome.'}
        </p>
      )}
      <ListPagination
        total={total}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        onPageChange={list.setPage}
      />
    </div>
  );
}
