'use client';

import { useId, useRef, useState } from 'react';

import { MediaGrid } from '@/components/media/MediaGrid';
import type { MediaItem } from '@/components/media/MediaLibrary';
import { MediaTile } from '@/components/media/MediaTile';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Pagination from '@/components/ui/Pagination';

// Grade de miniaturas num diálogo (#181), para os campos de mídia escolherem uma imagem da
// biblioteca sem carregá-la inteira. As páginas vêm de `load` (a Server Action da leitura
// paginada, #180). No Dialog do Ecme (#280), como os detalhes da imagem (#279): o react-modal
// prende o foco, torna a app inerte e, ao fechar por Esc, fundo, o X "Fechar" do Dialog ou
// escolha, devolve o foco ao botão que abriu. Título no corpo em `h4`, como o `UploadFile` do
// FileManager do Ecme, e a grade e as miniaturas da biblioteca (`MediaGrid`, `MediaTile`,
// #374). A `Pagination` (`nav "Paginação"`) só aparece depois que a primeira página é lida.
// Enquanto a próxima página carrega, a grade e a paginação anteriores continuam na tela, para
// o foco não se perder, e só a resposta mais recente vale. Erro e biblioteca vazia ficam só no
// `role="status"`.

/** Uma página da biblioteca: o mesmo formato do `MediaPage` da action. */
export type MediaPickerPage = { items: MediaItem[]; total: number; page: number; pageSize: number };

/** `data` é a última página lida: durante a carga, a grade e a paginação continuam nela. */
type State =
  | { kind: 'loading'; page: number; data?: MediaPickerPage }
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
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: 'loading', page: 1 });
  // Só a leitura mais recente atualiza a grade (cliques seguidos na paginação).
  const request = useRef(0);

  const show = async (page: number, fresh = false) => {
    const current = ++request.current;
    setState((previous) => ({
      kind: 'loading',
      page,
      data: fresh || previous.kind === 'error' ? undefined : previous.data,
    }));
    const data = await load(page);
    if (current !== request.current) return;
    setState(data === null ? { kind: 'error', page } : { kind: 'ready', data });
  };

  const openDialog = () => {
    setOpen(true);
    void show(1, true);
  };

  const close = () => setOpen(false);

  const choose = (item: MediaItem) => {
    onSelect(item.id, item);
    close();
  };

  const shown = state.kind === 'error' ? undefined : state.data;
  const page = state.kind === 'ready' ? state.data.page : state.page;
  const pages = shown ? Math.max(1, Math.ceil(shown.total / shown.pageSize)) : 1;
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
      {/* `type="button"`: o seletor fica dentro do formulário do editor, e abrir não o envia. */}
      <Button ref={buttonRef} type="button" size="sm" aria-haspopup="dialog" onClick={openDialog}>
        {label}
      </Button>
      <Dialog isOpen={open} onClose={close} aria={{ labelledby: `${id}-title` }}>
        <div className="space-y-4">
          <h4 id={`${id}-title`}>Escolher imagem</h4>
          <p role="status" className="text-sm">
            {status}
          </p>
          {shown && shown.items.length > 0 && (
            <>
              <MediaGrid label="Imagens da biblioteca">
                {shown.items.map((item) => (
                  <li key={item.id}>
                    <MediaTile item={item} onClick={() => choose(item)}>
                      Mídia {item.id} · {item.width}×{item.height}
                    </MediaTile>
                  </li>
                ))}
              </MediaGrid>
              <Pagination
                total={pages}
                pageSize={1}
                currentPage={page}
                onChange={(next) => void show(next)}
              />
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
