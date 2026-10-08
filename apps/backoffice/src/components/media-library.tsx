'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Biblioteca de mídia do site (#52): envio pela rota de envio, "processando" até a mídia
// aparecer no listMedia (a ingestão e as variantes rodam no backoffice-worker) e a grade
// com as miniaturas de media.<domínio>.

/** Mídia na grade: a miniatura já resolvida para o endereço de mídia do site. */
export type MediaItem = {
  id: number;
  width: number;
  height: number;
  /** Formatos preferidos, em `<source>`, antes do `src` de reserva. */
  sources: { type: string; url: string }[];
  src: string;
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

export function MediaLibrary({
  siteId,
  items: initialItems,
  canWrite,
  refresh,
  pollMs = 2000,
  timeoutMs = 60_000,
}: {
  siteId: string;
  items: MediaItem[];
  canWrite: boolean;
  /** Relê a biblioteca; `null` se a leitura foi recusada. */
  refresh: (siteId: string) => Promise<MediaItem[] | null>;
  pollMs?: number;
  timeoutMs?: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [processing, setProcessing] = useState(0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const knownIds = useRef(new Set(initialItems.map((item) => item.id)));
  const deadline = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // Enquanto há envio processando: relê a lista; cada ID novo fecha um envio.
  useEffect(() => {
    if (processing === 0) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void refresh(siteId)
        .then((next) => {
          if (next !== null) {
            const added = next.filter((item) => !knownIds.current.has(item.id)).length;
            knownIds.current = new Set(next.map((item) => item.id));
            setItems(next);
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
  }, [processing, refresh, siteId, pollMs]);

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
        headers: file.type ? { 'content-type': file.type } : undefined,
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
            <figure className="space-y-1">
              <MediaThumbnail item={item} />
              <figcaption className="text-xs text-muted-foreground">
                Mídia {item.id} · {item.width}×{item.height}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {items.length === 0 && processing === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma imagem na biblioteca.</p>
      )}
    </div>
  );
}

/** Motivo da recusa, do problem+json da rota (ou o status, se não vier). */
async function refusal(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { title?: unknown } | null;
  return typeof body?.title === 'string' ? body.title : `HTTP ${response.status}`;
}
