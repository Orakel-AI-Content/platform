// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import {
  LastBuildSummary,
  PendingCount,
  PublishNowPanel,
  SiteStateIndicator,
} from './SiteStatus.tsx';

// Estado de publicação compartilhado pela lista de sites e pela página do site (#149).

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
// "Publicar agora" confirma num diálogo (#327), que esconde o contêiner da app.
let app: HTMLElement;
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});

/** Confirma no diálogo de "Publicar agora". */
async function confirmPublish(user: ReturnType<typeof userEvent.setup>, siteId: string) {
  const dialog = await screen.findByRole('alertdialog', { name: `Publicar ${siteId} agora?` });
  await user.click(within(dialog).getByRole('button', { name: 'Publicar' }));
}
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  app.remove();
});

describe('pendências', () => {
  it('0 fica sem link', () => {
    render(<PendingCount siteId="exemplo-a" count={0} />);

    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('maior que 0 leva à tela de pendências do site', () => {
    render(<PendingCount siteId="exemplo-a" count={1} />);

    const link = screen.getByRole('link', { name: '1 mudança pendente em exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/pendencias');
    expect(link.querySelector('.tag-prefix')?.className).toContain('bg-warning');
  });
});

describe('estado do site (#511)', () => {
  const paused = {
    id: 'exemplo-a',
    state: 'pausado' as const,
    pausedReason: 'render: tema inexistente',
    pausedCulprit: null,
  };

  it.each([false, true])(
    'pausado com culpado content leva ao conteúdo (compact: %s)',
    (compact) => {
      render(
        <SiteStateIndicator
          site={{ ...paused, pausedCulprit: { origin: 'content', reference: '42' } }}
          compact={compact}
        />,
      );

      expect(screen.getByText('Pausado').querySelector('.tag-prefix')).toBeTruthy();
      expect(screen.getByText('render: tema inexistente')).toBeTruthy();
      // Na lista, o motivo cortado é o próprio link; o culpado vem no nome acessível.
      const link = screen.getByRole('link', {
        name: compact
          ? 'render: tema inexistente · Conteúdo 42 culpado pela pausa de exemplo-a'
          : 'Conteúdo 42 culpado pela pausa de exemplo-a',
      });
      expect(link.getAttribute('href')).toBe('/sites/exemplo-a/conteudos/42');
    },
  );

  it('culpado redirect, sem tela própria, fica sem link', () => {
    render(
      <SiteStateIndicator
        site={{ ...paused, pausedCulprit: { origin: 'redirect', reference: '7' } }}
      />,
    );

    expect(screen.getByText(/^Conteúdo culpado:/).textContent).toBe(
      'Conteúdo culpado: Redirecionamento 7',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('sem culpado mostra só a tag e o motivo', () => {
    const { container } = render(<SiteStateIndicator site={paused} />);

    expect(container.textContent).toBe('Pausadorender: tema inexistente');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('ativo mostra só a tag, mesmo com motivo antigo gravado', () => {
    const { container } = render(
      <SiteStateIndicator
        site={{ ...paused, state: 'ativo', pausedCulprit: { origin: 'content', reference: '42' } }}
        compact
      />,
    );

    expect(container.textContent).toBe('Ativo');
  });
});

describe('último build', () => {
  it('mostra resultado, data no fuso do site e versão', () => {
    const finishedAt = new Date('2026-10-01T12:00:00Z');
    render(
      <LastBuildSummary
        build={{ status: 'ok', versionId: 'v1', finishedAt }}
        timeZone="America/Sao_Paulo"
      />,
    );

    // Tag do Ecme: o ponto na cor do resultado.
    expect(screen.getByText('Publicado').querySelector('.tag-prefix')?.className).toContain(
      'bg-success',
    );
    expect(screen.getByText('01/10/2026, 09:00 BRT · v1')).toBeTruthy();
  });

  it('sem build mostra "—"', () => {
    render(<LastBuildSummary build={null} timeZone="UTC" />);

    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('Publicar agora de um site', () => {
  it('mostra o erro num Alert logo abaixo do botão', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: false, message: 'Site pausado: não publica.' }),
    );
    render(<PublishNowPanel siteId="exemplo-a" action={publishNow} />);
    const region = screen.getByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    await confirmPublish(user, 'exemplo-a');

    await waitFor(() => expect(region.textContent).toBe('Site pausado: não publica.'));
    expect(region.querySelector('.alert')).not.toBeNull();
    expect(publishNow).toHaveBeenCalledWith('exemplo-a');
  });

  it('o sucesso vai para o toast, sem Alert', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: true, message: 'Build de exemplo-a enfileirado.' }),
    );
    render(
      <>
        <PublishNowPanel siteId="exemplo-a" action={publishNow} />
        <ToastProvider />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));
    await confirmPublish(user, 'exemplo-a');

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Build de exemplo-a enfileirado.'),
    );
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('pede confirmação na cor de erro; Cancelar e Esc não publicam e devolvem o foco', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: true, message: 'Build de exemplo-a enfileirado.' }),
    );
    render(<PublishNowPanel siteId="exemplo-a" action={publishNow} />);
    const button = screen.getByRole('button', { name: 'Publicar agora exemplo-a' });
    expect(button.className).toContain('text-error');

    await user.click(button);
    const dialog = screen.getByRole('alertdialog', { name: 'Publicar exemplo-a agora?' });
    expect(within(dialog).getByRole('button', { name: 'Publicar' }).className).toContain(
      'bg-error',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(button);
    expect(publishNow).not.toHaveBeenCalled();
  });
});
