// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComponentProps } from 'react';

import { MediaLibrary, type MediaItem } from './media-library.tsx';
import type { MediaPickerPage } from './media-picker.tsx';

// Biblioteca de mídia (#52, #186): envio pela rota, "processando" até o total da página
// crescer, recusa com o motivo, grade sem envio para quem não edita, nome e data de cada
// imagem no fuso do site, e busca e página pela URL (`list-state`).

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const search = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sites/exemplo-a/midia',
  useSearchParams: () => new URLSearchParams(search.value),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  search.value = '';
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

const pageOf = (items: MediaItem[], total = items.length): MediaPickerPage => ({
  items,
  total,
  page: 1,
  pageSize: 24,
});

type Props = ComponentProps<typeof MediaLibrary>;

function renderLibrary(props: Partial<Props> & Pick<Props, 'items' | 'canWrite' | 'refresh'>) {
  return render(
    <MediaLibrary
      siteId="exemplo-a"
      timeZone="America/Sao_Paulo"
      total={props.items.length}
      page={1}
      pageSize={24}
      search=""
      {...props}
    />,
  );
}

/** Retorno do envio (a primeira região de status; a da paginação vem depois). */
const uploadStatus = () => screen.getAllByRole('status')[0];

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
      .fn<Props['refresh']>()
      .mockResolvedValueOnce(pageOf([item(1)]))
      .mockResolvedValue(pageOf([item(1), item(2)]));
    renderLibrary({ items: [item(1)], canWrite: true, refresh, pollMs: 5 });

    await user.upload(screen.getByLabelText(/Imagem \(JPEG/), image());
    await user.click(screen.getByRole('button', { name: 'Enviar imagem' }));

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/sites/exemplo-a/midia/envio');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(File);
    expect((init?.headers as Record<string, string>)['x-file-name']).toBe(
      encodeURIComponent((init?.body as File).name),
    );
    expect(uploadStatus()?.textContent).toBe('Imagem enviada; processando…');
    expect(screen.getByText('Processando…')).toBeTruthy();

    await waitFor(() => expect(uploadStatus()?.textContent).toBe('Imagem pronta na biblioteca.'));
    expect(screen.queryByText('Processando…')).toBeNull();
    expect(screen.getByText('Sem nome (Mídia 2) · Data de envio não registrada')).toBeTruthy();
    expect(refresh).toHaveBeenCalledWith('exemplo-a', 1, '');
  });

  it('passado o tempo-limite, avisa que ainda está processando', async () => {
    const user = userEvent.setup();
    stubFetch(Response.json({ uploadKey: 'uploads/x.jpg', format: 'jpeg' }, { status: 202 }));
    const refresh = vi.fn(() => Promise.resolve(pageOf([item(1)])));
    renderLibrary({ items: [item(1)], canWrite: true, refresh, pollMs: 5, timeoutMs: 0 });

    await user.upload(screen.getByLabelText(/Imagem \(JPEG/), image());
    await user.click(screen.getByRole('button', { name: 'Enviar imagem' }));

    await waitFor(() => expect(uploadStatus()?.textContent).toMatch(/ainda está processando/));
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
    const refresh = vi.fn(() => Promise.resolve(pageOf([])));
    renderLibrary({ items: [], canWrite: true, refresh });

    await user.upload(screen.getByLabelText(/Imagem \(JPEG/), image());
    await user.click(screen.getByRole('button', { name: 'Enviar imagem' }));

    expect(uploadStatus()?.textContent).toBe(
      'Envio recusado: O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
    );
    expect(screen.queryByText('Processando…')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sem content.write, mostra a grade e não oferece envio', () => {
    renderLibrary({
      items: [item(1)],
      canWrite: false,
      refresh: vi.fn(() => Promise.resolve(null)),
    });

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

  it('mostra o nome original e a data de envio no fuso do site; sem envio, os textos de reserva', () => {
    renderLibrary({
      items: [
        { ...item(1), originalName: 'Praia ação 01.jpg', uploadedAt: '2026-10-01T15:30:00.000Z' },
        { ...item(2), originalName: null, uploadedAt: null },
      ],
      canWrite: false,
      refresh: vi.fn(() => Promise.resolve(null)),
    });

    expect(screen.getByText('Praia ação 01.jpg · 01/10/2026, 12:30 BRT')).toBeTruthy();
    expect(screen.getByText('Sem nome (Mídia 2) · Data de envio não registrada')).toBeTruthy();
  });

  it('a busca por nome e a paginação vão para a URL; o total aparece', async () => {
    const user = userEvent.setup();
    renderLibrary({
      items: [item(1)],
      total: 50,
      canWrite: false,
      refresh: vi.fn(() => Promise.resolve(null)),
    });

    expect(screen.getByRole('navigation', { name: 'Paginação' }).textContent).toContain(
      '50 resultados',
    );
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nome do arquivo' }), 'p');
    expect(router.replace).toHaveBeenLastCalledWith('/sites/exemplo-a/midia?q=p', {
      scroll: false,
    });

    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(router.replace).toHaveBeenLastCalledWith(expect.stringContaining('pagina=2'), {
      scroll: false,
    });
  });

  it('busca sem resultado diz que não há imagem com esse nome', () => {
    renderLibrary({
      items: [],
      search: 'nada',
      canWrite: false,
      refresh: vi.fn(() => Promise.resolve(null)),
    });

    expect(screen.getByText('Nenhuma imagem com esse nome.')).toBeTruthy();
  });
});
