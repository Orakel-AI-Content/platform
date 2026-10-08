'use client';

import { useId, useRef, useState } from 'react';

import { MediaThumbnail, type MediaItem } from '@/components/media-library';
import { Button } from '@/components/ui/button';

// Grade de miniaturas num diálogo (#181), para os campos de mídia escolherem uma imagem da
// biblioteca sem carregá-la inteira: `<dialog>` nativo com `showModal` (o navegador prende o
// foco e torna o resto da página inerte), sem Radix, como o `ActionsMenu` com a Popover API.
// As páginas vêm de `load` (a Server Action da leitura paginada, #180).

/** Uma página da biblioteca: o mesmo formato do `MediaPage` da action. */
export type MediaPickerPage = { items: MediaItem[]; total: number; page: number; pageSize: number };

type State =
  | { kind: 'loading'; page: number }
  | { kind: 'error'; page: number }
  | { kind: 'ready'; data: MediaPickerPage };

export function MediaPicker({
  label,
  load,
  onSelect,
  buttonRef,
}: {
  /** Texto do botão que abre o diálogo ("Escolher imagem", "Trocar"). */
  label: string;
  /** Página `page` (a partir de 1), ou `null` quando não pôde ser lida. */
  load: (page: number) => Promise<MediaPickerPage | null>;
  /** Recebe também o item escolhido, para quem chama mostrar a miniatura sem nova leitura. */
  onSelect: (id: number, item: MediaItem) => void;
  /** `ref` do botão que abre, para o foco vindo de fora (resumo de erros, recusa do servidor). */
  buttonRef?: (element: HTMLButtonElement | null) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading', page: 1 });

  const show = async (page: number) => {
    setState({ kind: 'loading', page });
    const data = await load(page);
    setState(data === null ? { kind: 'error', page } : { kind: 'ready', data });
  };

  const open = () => {
    dialog.current?.showModal();
    void show(1);
  };

  const choose = (item: MediaItem) => {
    onSelect(item.id, item);
    dialog.current?.close();
  };

  // O botão de origem é o mesmo para o retorno do foco e para quem chama (`buttonRef`).
  const setTrigger = (element: HTMLButtonElement | null) => {
    trigger.current = element;
    buttonRef?.(element);
  };

  const page = state.kind === 'ready' ? state.data.page : state.page;
  const pages =
    state.kind === 'ready' ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1;
  const status =
    state.kind === 'loading'
      ? 'Carregando…'
      : state.kind === 'error'
        ? 'Não foi possível carregar as imagens.'
        : state.data.total === 0
          ? 'Nenhuma imagem na biblioteca.'
          : `Página ${page} de ${pages} · ${state.data.total} ${state.data.total === 1 ? 'imagem' : 'imagens'}`;

  return (
    <>
      <Button ref={setTrigger} variant="outline" size="sm" aria-haspopup="dialog" onClick={open}>
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        // Esc (cancel) e escolha terminam aqui: o foco volta ao botão de origem.
        onClose={() => trigger.current?.focus()}
        className="m-auto w-[min(48rem,calc(100vw-2rem))] rounded-md border border-border bg-background p-4 text-foreground shadow-md backdrop:bg-black/50"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id={`${id}-title`} className="text-lg font-semibold">
              Escolher imagem
            </h2>
            <Button variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
              Fechar
            </Button>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
          {state.kind === 'ready' && state.data.items.length > 0 && (
            <ul
              aria-label="Imagens da biblioteca"
              className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3"
            >
              {state.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    className="w-full space-y-1 rounded-md text-left hover:bg-muted"
                  >
                    <MediaThumbnail item={item} />
                    <span className="block text-sm">
                      Mídia {item.id} · {item.width}×{item.height}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={state.kind !== 'ready' || page <= 1}
              onClick={() => void show(page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={state.kind !== 'ready' || page >= pages}
              onClick={() => void show(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
