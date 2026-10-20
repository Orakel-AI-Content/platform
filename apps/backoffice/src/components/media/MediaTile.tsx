import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { MediaThumbnail, type MediaItem } from '@/components/media/MediaLibrary';
import classNames from '@/components/ui/utils/classNames';

// Miniatura clicável (#374): a `MediaThumbnail` e a legenda num botão, o mesmo nos detalhes da
// biblioteca e no seletor do editor. A legenda tem um estilo só; o texto vem de quem usa e é o
// nome do botão (a imagem tem `alt=""`). `type="button"` fixo: o seletor fica dentro do
// formulário do editor, e escolher não o envia. O hover segue o item do menu do Ecme (#397): o
// cartão da biblioteca e o diálogo do seletor são gray-800 no escuro, e o fundo sobe a gray-700
// com a legenda em gray-100: o gray-400 que ela herda do body não chega ao AA sobre gray-700.

export type MediaTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  item: MediaItem;
  /** A legenda: "<nome> · <data>" na biblioteca, "Mídia N · L×A" no seletor. */
  children: ReactNode;
};

export function MediaTile({ item, className, children, ...rest }: MediaTileProps) {
  return (
    <button
      {...rest}
      type="button"
      className={classNames(
        'group w-full space-y-1 rounded-md text-left hover:bg-gray-200 dark:hover:bg-gray-700',
        className,
      )}
    >
      <MediaThumbnail item={item} />
      <span className="block text-xs dark:group-hover:text-gray-100">{children}</span>
    </button>
  );
}
