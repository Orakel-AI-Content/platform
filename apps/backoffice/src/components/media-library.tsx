'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ListPagination, ListToolbar } from '@/components/list-controls.tsx';
import { MediaDetails } from '@/components/media-details';
import { useListState, type ListConfig } from '@/components/list-state.ts';
import type { MediaPickerPage } from '@/components/media-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Biblioteca de mídia do site (#52, #186): envio pela rota de envio, "processando" até a
// mídia aparecer na página (a ingestão e as variantes rodam no backoffice-worker) e a grade
// paginada no servidor, com busca por nome, nome e data de envio de cada imagem e as
// miniaturas de media.<domínio>. Busca e página ficam na URL (`q`, `pagina`).

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

type Status = { kind: 'info' | 'error'; text: string };

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
  pollMs = 2000,
  timeoutMs = 60_000,
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
  pollMs?: number;
  timeoutMs?: number;
}) {
  const list = useListState(MEDIA_LIST);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [processing, setProcessing] = useState(0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const knownTotal = useRef(initialTotal);
  const deadline = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // Enquanto há envio processando: relê a página; o total que cresce fecha envios.
  useEffect(() => {
    if (processing === 0) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void refresh(siteId, page, search)
        .then((next) => {
          if (next !== null) {
            const added = Math.max(0, next.total - knownTotal.current);
            knownTotal.current = next.total;
            setItems(next.items);
            setTotal(next.total);
            if (added > 0) {
              setProcessing((count) => Math.max(0, count - added));
              setStatus({
                kind: 'info',
                text:
                  added === 1
                    ? 'Imagem pronta na biblioteca.'
                    : `${added} imagens prontas na biblioteca.`,
              });
              return;
            }
          }
          if (Date.now() > deadline.current) {
            setProcessing(0);
            setStatus({
              kind: 'info',
              text: 'A imagem ainda está processando; recarregue a página mais tarde.',
            });
          }
        })
        // Falha de rede numa releitura: a próxima tentativa (ou o tempo-limite) resolve.
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, pollMs);
    return () => clearInterval(timer);
  }, [processing, refresh, siteId, page, search, pollMs]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = fileInput.current?.files?.[0];
    if (file === undefined) {
      setStatus({ kind: 'error', text: 'Escolha uma imagem para enviar.' });
      return;
    }
    setSending(true);
    setStatus({ kind: 'info', text: 'Enviando…' });
    try {
      const response = await fetch(`/sites/${encodeURIComponent(siteId)}/midia/envio`, {
        method: 'POST',
        body: file,
        headers: {
          ...(file.type ? { 'content-type': file.type } : {}),
          // Nome original (#184): cabeçalho HTTP só carrega Latin-1, então vai codificado.
          'x-file-name': encodeURIComponent(file.name),
        },
      });
      if (!response.ok) {
        setStatus({ kind: 'error', text: `Envio recusado: ${await refusal(response)}` });
        return;
      }
      deadline.current = Date.now() + timeoutMs;
      setProcessing((count) => count + 1);
      setStatus({ kind: 'info', text: 'Imagem enviada; processando…' });
      form.reset();
    } catch {
      setStatus({ kind: 'error', text: 'Envio falhou: sem resposta do servidor.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <form onSubmit={(event) => void upload(event)} className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="media-file">Imagem (JPEG, PNG, WebP ou AVIF, até 25 MB)</Label>
            <Input id="media-file" ref={fileInput} type="file" accept={ACCEPT} required />
          </div>
          <Button type="submit" disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar imagem'}
          </Button>
        </form>
      )}
      <p
        role="status"
        className={status?.kind === 'error' ? 'text-sm text-destructive' : 'text-sm'}
      >
        {status?.text}
      </p>
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
        {Array.from({ length: processing }, (_, index) => (
          <li
            key={`processando-${index}`}
            aria-busy="true"
            className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
          >
            Processando…
          </li>
        ))}
        {items.map((item) => (
          <li key={item.id}>
            <MediaDetails item={item} timeZone={timeZone} />
          </li>
        ))}
      </ul>
      {items.length === 0 && processing === 0 && (
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

/** Motivo da recusa, do problem+json da rota (ou o status, se não vier). */
async function refusal(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { title?: unknown } | null;
  return typeof body?.title === 'string' ? body.title : `HTTP ${response.status}`;
}
