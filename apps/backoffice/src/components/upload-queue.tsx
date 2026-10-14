'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

// Fila de envio da biblioteca (#188): até 20 imagens por vez, 3 subindo ao mesmo tempo por
// XHR (o `fetch` não dá progresso de upload) para a rota de envio, e o resultado de cada uma
// pela leitura dos envios por chave (`media_uploads`, #185): enviando N% → processando →
// pronta ou recusada com o motivo, seja a recusa da rota ou do job.

/** Mais que isso num lote: aviso, e só as primeiras sobem. */
export const MAX_FILES = 20;
/** Envios subindo ao mesmo tempo. */
export const CONCURRENCY = 3;

/** Estado de um envio lido do servidor (o mesmo formato do `getUploads`). */
export type UploadStatus = {
  uploadKey: string;
  status: 'processando' | 'pronta' | 'recusada';
  reason: string | null;
  mediaId: number | null;
};

/** Resultado da subida de um arquivo pela rota. */
export type SendResult = { ok: true; uploadKey: string } | { ok: false; reason: string };

/** Sobe um arquivo, avisando o progresso de 0 a 100. */
export type SendFile = (file: File, onProgress: (percent: number) => void) => Promise<SendResult>;

type EntryState =
  | { kind: 'aguardando' }
  | { kind: 'enviando'; percent: number }
  | { kind: 'processando'; uploadKey: string; deadline: number }
  | { kind: 'pronta' }
  | { kind: 'recusada'; reason: string }
  | { kind: 'demorando' };

export type UploadEntry = { id: number; name: string; state: EntryState };

/** Texto do estado de um arquivo na lista. */
export function entryLabel(state: EntryState): string {
  switch (state.kind) {
    case 'aguardando':
      return 'aguardando';
    case 'enviando':
      return `enviando ${state.percent}%`;
    case 'processando':
      return 'processando';
    case 'pronta':
      return 'pronta';
    case 'recusada':
      return `recusada: ${state.reason}`;
    case 'demorando':
      return 'ainda processando; recarregue a página mais tarde';
  }
}

/** Motivo da recusa, do problem+json da rota (ou o status, se não vier). */
function refusal(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { title?: unknown };
    if (typeof parsed.title === 'string') return parsed.title;
  } catch {
    // Corpo que não é JSON: fica o status.
  }
  return `HTTP ${status}`;
}

/** Envio por XHR para a rota da biblioteca, com o nome original no cabeçalho (#184). */
export function xhrSend(siteId: string): SendFile {
  return (file, onProgress) =>
    new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/sites/${encodeURIComponent(siteId)}/midia/envio`);
      if (file.type) xhr.setRequestHeader('content-type', file.type);
      // Cabeçalho HTTP só carrega Latin-1: o nome vai codificado.
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 202) {
          const body = JSON.parse(xhr.responseText) as { uploadKey: string };
          resolve({ ok: true, uploadKey: body.uploadKey });
        } else {
          resolve({ ok: false, reason: refusal(xhr.status, xhr.responseText) });
        }
      };
      xhr.onerror = () => resolve({ ok: false, reason: 'sem resposta do servidor' });
      xhr.send(file);
    });
}

/**
 * Estado da fila: `add` recebe os arquivos escolhidos ou soltos. `status` lê os envios por
 * chave; `onReady` avisa quando algum ficou pronto (a biblioteca relê a página).
 */
export function useUploadQueue({
  send,
  status,
  onReady,
  pollMs = 2000,
  timeoutMs = 120_000,
}: {
  send: SendFile;
  status: (keys: string[]) => Promise<UploadStatus[] | null>;
  onReady: () => void;
  pollMs?: number;
  timeoutMs?: number;
}) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [notice, setNotice] = useState('');
  const nextId = useRef(0);
  const pending = useRef<{ id: number; file: File }[]>([]);
  const running = useRef(0);

  const update = useCallback((id: number, state: EntryState) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, state } : entry)),
    );
  }, []);

  // Um trabalhador sobe os aguardando, um de cada vez, até a fila esvaziar; até CONCURRENCY
  // deles ao mesmo tempo. Um arquivo recusado não para os demais.
  const work = useCallback(async () => {
    running.current += 1;
    try {
      for (let next = pending.current.shift(); next; next = pending.current.shift()) {
        const { id, file } = next;
        update(id, { kind: 'enviando', percent: 0 });
        const result = await send(file, (percent) => update(id, { kind: 'enviando', percent }));
        update(
          id,
          result.ok
            ? { kind: 'processando', uploadKey: result.uploadKey, deadline: Date.now() + timeoutMs }
            : { kind: 'recusada', reason: result.reason },
        );
      }
    } finally {
      running.current -= 1;
    }
  }, [send, timeoutMs, update]);

  const add = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return;
      const accepted = files.slice(0, MAX_FILES);
      setNotice(
        files.length > MAX_FILES
          ? `Só as ${MAX_FILES} primeiras imagens foram enviadas; envie as outras em seguida.`
          : '',
      );
      const added = accepted.map((file) => ({ id: (nextId.current += 1), file }));
      setEntries((current) => [
        ...current,
        ...added.map(({ id, file }) => ({
          id,
          name: file.name,
          state: { kind: 'aguardando' } as const,
        })),
      ]);
      pending.current.push(...added);
      const idle = Math.min(CONCURRENCY - running.current, pending.current.length);
      for (let index = 0; index < idle; index += 1) void work();
    },
    [work],
  );

  // Enquanto houver envio processando: lê o estado por chave.
  const processingKeys = entries.flatMap((entry) =>
    entry.state.kind === 'processando' ? [entry.state.uploadKey] : [],
  );
  const keysKey = processingKeys.join('|');
  useEffect(() => {
    if (keysKey === '') return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void status(keysKey.split('|'))
        .then((states) => {
          const byKey = new Map((states ?? []).map((state) => [state.uploadKey, state]));
          setEntries((current) =>
            current.map((entry) => {
              if (entry.state.kind !== 'processando') return entry;
              const found = byKey.get(entry.state.uploadKey);
              if (found?.status === 'pronta') {
                return { ...entry, state: { kind: 'pronta' } };
              }
              if (found?.status === 'recusada') {
                return {
                  ...entry,
                  state: { kind: 'recusada', reason: found.reason ?? 'recusada' },
                };
              }
              return Date.now() > entry.state.deadline
                ? { ...entry, state: { kind: 'demorando' } }
                : entry;
            }),
          );
          // As chaves pedidas eram todas de envios processando: uma pronta é imagem nova.
          if ((states ?? []).some((state) => state.status === 'pronta')) onReady();
        })
        // Falha de rede numa leitura: a próxima tentativa (ou o tempo-limite) resolve.
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, pollMs);
    return () => clearInterval(timer);
  }, [keysKey, status, onReady, pollMs]);

  return { entries, notice, add };
}

/** Lista dos envios: um arquivo por linha, com o estado em `role="status"`. */
export function UploadList({
  entries,
  notice,
}: {
  entries: readonly UploadEntry[];
  notice: string;
}) {
  return (
    <div className="space-y-2">
      <p role="status" className="text-sm">
        {notice}
      </p>
      {entries.length > 0 && (
        <ul aria-label="Envios" className="space-y-1 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium break-all">{entry.name}</span>
              <span
                role="status"
                className={cn(
                  entry.state.kind === 'recusada' ? 'text-destructive' : 'text-muted-foreground',
                  entry.state.kind === 'pronta' && 'text-success',
                )}
              >
                {entryLabel(entry.state)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
