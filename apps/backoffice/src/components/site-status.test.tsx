// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LastBuildSummary, PendingCount, PublishNowPanel } from './site-status.tsx';

// Estado de publicação compartilhado pela lista de sites e pela página do site (#149).

afterEach(cleanup);

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

    expect(screen.getByText('Publicado').className).toContain('text-success');
    expect(screen.getByText('01/10/2026, 09:00 BRT · v1')).toBeTruthy();
  });

  it('sem build mostra "—"', () => {
    render(<LastBuildSummary build={null} timeZone="UTC" />);

    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('Publicar agora de um site', () => {
  it('anuncia o retorno numa região de status própria', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn(() =>
      Promise.resolve({ ok: false, message: 'Site pausado: não publica.' }),
    );
    render(<PublishNowPanel siteId="exemplo-a" action={publishNow} />);

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Site pausado: não publica.'),
    );
    expect(screen.getByRole('status').className).toContain('text-destructive');
    expect(publishNow).toHaveBeenCalledWith('exemplo-a');
  });
});
