// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentProps } from 'react';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp.ts';
import { MediaLibrary, type MediaItem } from './MediaLibrary.tsx';
import type { MediaPickerPage } from './MediaPicker.tsx';
import type { SendFile } from './UploadQueue.tsx';

// Biblioteca de mídia (#52, #186): envio pela rota, "processando" até o total da página
// crescer, recusa com o motivo, grade sem envio para quem não edita, nome e data de cada
// imagem no fuso do site, e busca e página pela URL (`useListState`). O envio é pelo diálogo
// "Enviar imagens" (#376); soltar sobre a grade não envia.

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const search = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/sites/exemplo-a/midia',
  useSearchParams: () => new URLSearchParams(search.value),
}));

let app: HTMLElement;

beforeAll(() => {
  // O happy-dom rejeita a animação nativa que o motion cancela ao desmontar.
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});

afterEach(() => {
  cleanup();
  app.remove();
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
      uploadStatus={() => Promise.resolve([])}
      pollMs={5}
      {...props}
    />,
    { container: app },
  );
}

/** Abre o diálogo de envio e devolve o campo de arquivo da área de soltar. */
async function openUpload(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Enviar imagens' }));
  const dialog = screen.getByRole('dialog', { name: 'Enviar imagens' });
  return within(dialog).getByLabelText<HTMLInputElement>(/^Solte as imagens aqui/);
}

async function expectUploadClosed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('biblioteca de mídia', () => {
  it('envia várias imagens pela fila; a pronta aparece na grade e a recusada mostra o motivo', async () => {
    const user = userEvent.setup();
    const send = vi.fn<SendFile>((file) =>
      Promise.resolve(
        file.name === 'texto.jpg'
          ? { ok: false, reason: 'O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF' }
          : { ok: true, uploadKey: `uploads/exemplo-a/${file.name}` },
      ),
    );
    const uploadStatus = vi.fn((_site: string, keys: string[]) =>
      Promise.resolve(
        keys.map((uploadKey) => ({
          uploadKey,
          status: 'pronta' as const,
          reason: null,
          mediaId: 2,
        })),
      ),
    );
    const refresh = vi.fn(() => Promise.resolve(pageOf([item(1), item(2)])));
    renderLibrary({ items: [item(1)], canWrite: true, refresh, uploadStatus, send });

    const input = await openUpload(user);
    await user.upload(input, [image(), new File(['x'], 'texto.jpg', { type: 'image/jpeg' })]);
    await expectUploadClosed();

    const uploads = screen.getByRole('list', { name: 'Envios' });
    await waitFor(() =>
      expect(within(uploads).getByText('foto.jpg').nextElementSibling?.textContent).toBe('pronta'),
    );
    expect(within(uploads).getByText('texto.jpg').nextElementSibling?.textContent).toBe(
      'recusada: O arquivo não é uma imagem JPEG, PNG, WebP ou AVIF',
    );
    expect(uploadStatus).toHaveBeenCalledWith('exemplo-a', ['uploads/exemplo-a/foto.jpg']);
    await waitFor(() =>
      expect(screen.getByText('Sem nome (Mídia 2) · Data de envio não registrada')).toBeTruthy(),
    );
    expect(refresh).toHaveBeenCalledWith('exemplo-a', 1, '');
  });

  it('"Enviar imagens" abre o diálogo com o campo que aceita várias imagens dos formatos da rota', async () => {
    const user = userEvent.setup();
    renderLibrary({ items: [], canWrite: true, refresh: vi.fn(() => Promise.resolve(null)) });

    const input = await openUpload(user);
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,image/avif');
  });

  it('soltar sobre a biblioteca não envia; soltar na área do diálogo põe na fila, que fica à vista', async () => {
    const user = userEvent.setup();
    const send = vi.fn<SendFile>(() => new Promise(() => undefined));
    const { container } = renderLibrary({
      items: [],
      canWrite: true,
      refresh: vi.fn(() => Promise.resolve(null)),
      send,
    });
    const library = container.firstElementChild as HTMLElement;
    const dataTransfer = { types: ['Files'], files: [image()] };

    fireEvent.dragOver(library, { dataTransfer });
    fireEvent.drop(library, { dataTransfer });
    expect(library.className).not.toContain('border-primary');
    expect(send).not.toHaveBeenCalled();

    // Soltar sobre o campo que cobre a área: o navegador põe os arquivos nele e dispara change.
    const input = await openUpload(user);
    fireEvent.drop(input.parentElement as HTMLElement, { dataTransfer });
    fireEvent.change(input, { target: { files: [image()] } });

    await expectUploadClosed();
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(screen.getByRole('list', { name: 'Envios' }).textContent).toContain('foto.jpg');
  });

  it('sem content.write, mostra a grade e não oferece envio', () => {
    renderLibrary({
      items: [item(1)],
      canWrite: false,
      refresh: vi.fn(() => Promise.resolve(null)),
    });

    expect(screen.queryByRole('button', { name: 'Enviar imagens' })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
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

    expect(screen.getByText('50 resultados').getAttribute('role')).toBe('status');
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeTruthy();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nome do arquivo' }), 'p');
    expect(router.replace).toHaveBeenLastCalledWith('/sites/exemplo-a/midia?q=p', {
      scroll: false,
    });

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
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
