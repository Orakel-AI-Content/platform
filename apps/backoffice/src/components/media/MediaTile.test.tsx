// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MediaItem } from './MediaLibrary.tsx';
import { MediaTile } from './MediaTile.tsx';

// Miniatura clicável (#374): a legenda é o nome do botão, a imagem é decorativa, o clique chega
// a quem usa e o botão nunca envia o formulário em volta.

afterEach(cleanup);

const item: MediaItem = {
  id: 7,
  width: 800,
  height: 600,
  sources: [{ type: 'image/avif', url: 'https://media.exemplo-a.test/7.avif' }],
  src: 'https://media.exemplo-a.test/7.webp',
};

describe('miniatura clicável', () => {
  it('a legenda é o nome do botão, e a miniatura não tem texto próprio', () => {
    render(<MediaTile item={item}>Mídia 7 · 800×600</MediaTile>);

    const tile = screen.getByRole('button', { name: 'Mídia 7 · 800×600' });
    expect(tile.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(tile.querySelector('source')?.getAttribute('type')).toBe('image/avif');
  });

  it('repassa onClick e as props de botão; dentro de um formulário, não o envia', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <MediaTile item={item} aria-haspopup="dialog" onClick={onClick}>
          foto.jpg · 01/10/2026
        </MediaTile>
      </form>,
    );

    const tile = screen.getByRole('button', { name: 'foto.jpg · 01/10/2026' });
    expect(tile.getAttribute('aria-haspopup')).toBe('dialog');
    expect(tile.getAttribute('type')).toBe('button');
    await user.click(tile);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
