// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaLibrary, type MediaItem } from './media-library.tsx';

// Biblioteca de mídia (#52): envio pela rota, "processando" até a mídia aparecer na lista,
// recusa com o motivo e grade sem envio para quem não edita.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item = (id: number): MediaItem => ({
  id,
  width: 1600,
  height: 900,
  sources: [{ type: 'image/avif', url: `https://media.exemplo-a.test/exemplo-a/h${id}-320.avif` }],
  src: `https://media.exemplo-a.test/exemplo-a/h${id}-320.webp`,
});

const image = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'foto.jpg', { type: 'image/jpeg' });

function stubFetch(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('biblioteca de mídia', () => {
  it('envia pela rota, mostra "processando" e sai quando a lista traz um ID novo', async () => {
    const user = userEvent.setup();
    const fetch = stubFetch(
      Response.json({ uploadKey: 'uploads/x.jpg', format: 'jpeg' }, { status: 202 }),
    );
    const refresh = vi
      .fn<(siteId: string) => Promise<MediaItem[] | null>>()
      .mockResolvedValueOnce([item(1)])
      .mockResolvedValue([item(1), item(2)]);
    render(
      <MediaLibrary siteId="exemplo-a" items={[item(1)]} canWrite refresh={refresh} pollMs={5} />,
    );

    await user.upload(screen.getByLabelText(/Imagem \(JPEG/), image());
    await user.click(screen.getByRole('button', { name: 'Enviar imagem' }));

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/sites/exemplo-a/midia/envio');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(File);
    expect(screen.getByRole('status').textContent).toBe('Imagem enviada; processando…');
    expect(screen.getByText('Processando…')).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Imagem pronta na biblioteca.'),
    );
    expect(screen.queryByText('Processando…')).toBeNull();
    expect(screen.getByText('Mídia 2 · 1600×900')).toBeTruthy();
    expect(refresh).toHaveBeenCalledWith('exemplo-a');
  });

  it('passado o tempo-limite, avisa que ainda está processando', async () => {
    const user = userEvent.setup();
    stubFetch(Response.json({ uploadKey: 'uploads/x.jpg', format: 'jpeg' }, { status: 202 }));
    const refresh = vi.fn(() => Promise.resolve([item(1)]));
    render(
      <MediaLibrary
        siteId="exemplo-a"
        items={[item(1)]}
        canWrite
        refresh={refresh}
        pollMs={5}
        timeoutMs={0}
      />,
    );

    await user.upload(screen.getByLabelText(/Imagem \(JPEG/), image());
    await user.click(screen.getByRole('button', { name: 'Enviar imagem' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/ainda está processando/),
    );
    expect(screen.queryByText('Processando…')).toBeNull();
  });

  it('recusa da rota mostra o motivo do problem+json', async () => {
    const user = userEvent.setup();
    stubFetch(
      new Response(
        JSON.stringify({
          title: 'O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
          status: 415,
        }),
        { status: 415, headers: { 'content-type': 'application/problem+json' } },
      ),
    );
    const refresh = vi.fn(() => Promise.resolve([]));
    render(<MediaLibrary siteId="exemplo-a" items={[]} canWrite refresh={refresh} />);

    await user.upload(screen.getByLabelText(/Imagem \(JPEG/), image());
    await user.click(screen.getByRole('button', { name: 'Enviar imagem' }));

    expect(screen.getByRole('status').textContent).toBe(
      'Envio recusado: O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
    );
    expect(screen.queryByText('Processando…')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sem content.write, mostra a grade e não oferece envio', () => {
    render(
      <MediaLibrary
        siteId="exemplo-a"
        items={[item(1)]}
        canWrite={false}
        refresh={vi.fn(() => Promise.resolve(null))}
      />,
    );

    expect(screen.queryByLabelText(/Imagem \(JPEG/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar imagem' })).toBeNull();
    const list = screen.getByRole('list', { name: 'Imagens do site' });
    const img = list.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://media.exemplo-a.test/exemplo-a/h1-320.webp');
    expect(img?.getAttribute('alt')).toBe('');
    expect(list.querySelector('source')?.getAttribute('srcset')).toBe(
      'https://media.exemplo-a.test/exemplo-a/h1-320.avif',
    );
  });
});
