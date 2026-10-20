'use client';

import { useCallback, useMemo, useState } from 'react';

import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { resultCount } from '@/components/shared/DataTable';
import { EmptyState, NoResults } from '@/components/shared/EmptyState';
import { ListToolbar } from '@/components/shared/ListControls.tsx';
import { ListHeader } from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';
import { MediaDetails } from '@/components/media/MediaDetails';
import { MediaGrid } from '@/components/media/MediaGrid';
import { MediaUpload } from '@/components/media/MediaUpload';
import {
  UploadList,
  useUploadQueue,
  xhrSend,
  type SendFile,
  type UploadStatus,
} from '@/components/media/UploadQueue';
import { useListState, type ListConfig } from '@/components/shared/useListState.ts';
import type { MediaPickerPage } from '@/components/media/MediaPicker';

// Biblioteca de mídia do site (#52, #186, #188): envio de várias imagens pela fila, com o
// resultado de cada arquivo, e a grade paginada no servidor, com busca por nome, nome e data de
// envio de cada imagem e as miniaturas de media.<domínio>. Busca e página ficam na URL (`q`,
// `pagina`). O envio é o diálogo com o Upload arrastável do Ecme (#376, `MediaUpload`): escolher
// ou soltar na área do diálogo põe os arquivos na fila, que fica à vista na biblioteca. No
// padrão de lista do template (#377): título, envio, fila, toolbar, grade, contagem e paginação
// num cartão; a regra única de estado vazio do `EmptyState` (#361); e o rodapé do `DataTable`
// (`Pagination` e "N resultados" em `role="status"`), sem o `DataTable`, porque é uma grade
// paginada no servidor, com tamanho fixo.

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
  titleId,
  title,
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
  /** `id` do título, para o `aria-labelledby` da página. */
  titleId: string;
  title: string;
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

  const upload = canWrite ? <MediaUpload accept={ACCEPT} onAdd={queue.add} /> : undefined;
  // Vazia é a biblioteca sem imagem nenhuma; com busca, é só a busca sem resultado. Pelo total
  // local, para a grade aparecer quando o primeiro envio fica pronto.
  const empty = total === 0 && search === '';

  return (
    <AdaptiveCard>
      <div className="flex flex-col gap-4">
        <ListHeader id={titleId} title={title} action={upload} />
        <UploadList entries={queue.entries} notice={queue.notice} />
        {empty ? (
          <EmptyState action={upload}>Nenhuma imagem na biblioteca.</EmptyState>
        ) : (
          <>
            <ListToolbar
              search={search}
              searchLabel="Buscar por nome do arquivo"
              onSearchChange={list.setSearch}
              onClear={list.clearFilters}
            />
            {items.length > 0 ? (
              <MediaGrid label="Imagens do site">
                {items.map((item) => (
                  <li key={item.id}>
                    <MediaDetails item={item} timeZone={timeZone} />
                  </li>
                ))}
              </MediaGrid>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4">
                <NoResults>Nenhuma imagem encontrada.</NoResults>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Pagination
                pageSize={pageSize}
                currentPage={page}
                total={total}
                onChange={list.setPage}
              />
              <p role="status" className="text-sm tabular-nums">
                {resultCount(total)}
              </p>
            </div>
          </>
        )}
      </div>
    </AdaptiveCard>
  );
}
