'use client';

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';

import { ListPagination, ListToolbar } from '@/components/shared/ListControls.tsx';
import { MediaDetails } from '@/components/media/MediaDetails';
import { MediaGrid } from '@/components/media/MediaGrid';
import {
  UploadList,
  useUploadQueue,
  xhrSend,
  type SendFile,
  type UploadStatus,
} from '@/components/media/UploadQueue';
import { useListState, type ListConfig } from '@/components/shared/useListState.ts';
import type { MediaPickerPage } from '@/components/media/MediaPicker';
import { Button } from '@/components/ui/Button';
import { FormItem } from '@/components/ui/Form';
import Input from '@/components/ui/Input';
import classNames from '@/components/ui/utils/classNames';

// Biblioteca de mídia do site (#52, #186, #188): envio de várias imagens pela fila (escolher
// no campo ou soltar sobre a biblioteca), com o resultado de cada arquivo, e a grade paginada
// no servidor, com busca por nome, nome e data de envio de cada imagem e as miniaturas de
// media.<domínio>. Busca e página ficam na URL (`q`, `pagina`). Envio no FormItem, Input e
// Button do Ecme (#281); a área de soltar destaca a borda em `primary`, como o `ui/Upload`
// arrastável do Ecme, sem usá-lo (ele envia ao escolher e tem lista própria).

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
        className="aspect-square w-full rounded-md border border-gray-200 object-cover dark:border-gray-700"
      />
    </picture>
  );
}

/** Formatos que a rota aceita (a assinatura do arquivo é conferida no domínio). */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/** Lista sem filtros nem ordenação: só a busca e a página da URL (`useListState`). */
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
  const fileId = useId();

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
      className={classNames(
        'space-y-6 rounded-lg border-2 border-dashed border-transparent',
        dragging && 'border-primary',
      )}
    >
      {canWrite && (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
          <FormItem
            htmlFor={fileId}
            label="Imagens (JPEG, PNG, WebP ou AVIF, até 25 MB cada; ou solte aqui)"
            className="mb-0"
          >
            <Input id={fileId} ref={fileInput} type="file" accept={ACCEPT} multiple required />
          </FormItem>
          <Button type="submit" variant="solid">
            Enviar imagens
          </Button>
        </form>
      )}
      <UploadList entries={queue.entries} notice={queue.notice} />
      <ListToolbar
        search={search}
        searchLabel="Buscar por nome do arquivo"
        onSearchChange={list.setSearch}
        onClear={list.clearFilters}
      />
      <MediaGrid label="Imagens do site">
        {items.map((item) => (
          <li key={item.id}>
            <MediaDetails item={item} timeZone={timeZone} />
          </li>
        ))}
      </MediaGrid>
      {items.length === 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
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
