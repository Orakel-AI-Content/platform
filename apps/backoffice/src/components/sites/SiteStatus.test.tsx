// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LastBuildSummary, PendingCount, SiteStateIndicator } from './SiteStatus.tsx';

// Estado de publicação compartilhado pela lista de sites e pela página do site (#149). As
// confirmações de "Publicar agora" e "Retomar" ficam com quem as abre: a lista
// (`SitesTable.test.tsx`) e o cabeçalho do site (`SiteOperations.test.tsx`, #595).

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
    // A data inteira numa linha (#585); a versão ao lado, a parte que a lista corta.
    const date = screen.getByText('01/10/2026, 09:00 BRT ·', { exact: false });
    expect(date.className).toContain('whitespace-pre');
    expect(date.parentElement?.textContent).toBe('01/10/2026, 09:00 BRT · v1');
  });

  it('sem build mostra "—"', () => {
    render(<LastBuildSummary build={null} timeZone="UTC" />);

    expect(screen.getByText('—')).toBeTruthy();
  });
});
