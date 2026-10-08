// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SiteSummary } from '@/domain/sites/sites.ts';

import { SitesTable } from './sites-table.tsx';

// Registro de instâncias: cada site leva aos seus conteúdos, para qualquer papel (#44).

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/sites' }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const site: SiteSummary = {
  id: 'exemplo-a',
  name: 'Exemplo A',
  domain: 'exemplo-a.test',
  lifecycle: 'publicado',
  state: 'ativo',
  pausedReason: null,
  release: null,
  indexavel: false,
  pendingChanges: 0,
  lastBuild: null,
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 300,
  timeZone: 'America/Sao_Paulo',
};

describe('tabela de sites', () => {
  it('tem o link para os conteúdos de cada site, mesmo sem outras ações', () => {
    render(<SitesTable rows={[site]} />);

    const link = screen.getByRole('link', { name: 'Conteúdos exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/conteudos');
  });

  it('tem o link para a biblioteca de mídia de cada site (#52)', () => {
    render(<SitesTable rows={[site]} />);

    const link = screen.getByRole('link', { name: 'Mídia exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/midia');
  });

  it('dá a cada estado de site o badge da sua variante, com o texto do estado (#86)', () => {
    render(
      <SitesTable
        rows={[
          site,
          { ...site, id: 'exemplo-b', state: 'promovendo' },
          { ...site, id: 'exemplo-c', state: 'pausado', pausedReason: 'cota' },
        ]}
      />,
    );

    expect(screen.getByText('Ativo').className).toContain('text-success');
    expect(screen.getByText('Promovendo').className).toContain('text-info');
    expect(screen.getByText('Pausado').className).toContain('text-warning');
    // O motivo fica sob o badge, cortado se for longo, com o texto inteiro em `title` (#100).
    expect(screen.getByText('cota').getAttribute('title')).toBe('cota');
  });

  it('dá a cada resultado de build o badge da sua variante (#86)', () => {
    const finishedAt = new Date('2026-10-01T12:00:00Z');
    render(
      <SitesTable
        rows={[
          { ...site, lastBuild: { status: 'ok', versionId: 'v1', finishedAt } },
          {
            ...site,
            id: 'exemplo-b',
            lastBuild: { status: 'failed', versionId: null, finishedAt },
          },
        ]}
      />,
    );

    // A etapa do ciclo de vida também se chama "Publicado"; o badge é o do último build.
    const [build] = screen
      .getAllByText('Publicado')
      .filter((element) => element.className.includes('text-success'));
    expect(build).toBeTruthy();
    expect(screen.getByText('Falhou').className).toContain('bg-destructive');
  });

  it('não mostra "SITE_ID" em nenhum cabeçalho; o ID fica sob o nome (#100)', () => {
    render(<SitesTable rows={[site]} />);

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual([
      'Site',
      'Ciclo de vida',
      'Estado',
      'Indexável',
      'Pendências',
      'Último build',
      'Ações',
    ]);
    expect(screen.getByRole('link', { name: 'Exemplo A' }).getAttribute('href')).toBe(
      '/sites/exemplo-a',
    );
    expect(screen.getByText('exemplo-a · exemplo-a.test')).toBeTruthy();
  });

  it('pendências > 0 se destacam e levam à tela de pendências; 0 não (#100)', () => {
    render(
      <SitesTable
        rows={[
          { ...site, pendingChanges: 3 },
          { ...site, id: 'exemplo-b' },
        ]}
      />,
    );

    const link = screen.getByRole('link', { name: '3 mudanças pendentes em exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/pendencias');
    expect(link.firstElementChild?.className).toContain('text-warning');
    expect(screen.queryByRole('link', { name: /pendentes em exemplo-b/ })).toBeNull();
  });

  it('põe Conteúdos, Mídia e, com site.configure, Editar configuração no menu Mais ações', () => {
    const { rerender } = render(<SitesTable rows={[site]} />);
    const menu = () => {
      const button = screen.getByRole('button', { name: 'Mais ações: exemplo-a' });
      const list = document.getElementById(button.getAttribute('popovertarget') ?? '');
      return [...(list?.querySelectorAll('a') ?? [])].map((link) => link.textContent);
    };
    expect(menu()).toEqual(['Conteúdos exemplo-a', 'Mídia exemplo-a']);

    rerender(<SitesTable rows={[site]} canConfigure />);
    expect(menu()).toEqual([
      'Conteúdos exemplo-a',
      'Mídia exemplo-a',
      'Editar configuração exemplo-a',
    ]);
  });

  it('"Publicar agora" fica fora do menu e anuncia numa única região de status', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((siteId: string) =>
      Promise.resolve({ ok: true, message: `Build de ${siteId} enfileirado.` }),
    );
    render(<SitesTable rows={[site, { ...site, id: 'exemplo-b' }]} publishNow={publishNow} />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-b' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Build de exemplo-b enfileirado.'),
    );
    expect(publishNow).toHaveBeenCalledWith('exemplo-b');
  });

  it('site pausado não tem "Publicar agora"; o ativo tem (#155)', () => {
    const publishNow = vi.fn(() => Promise.resolve({ ok: true, message: '' }));
    render(
      <SitesTable
        rows={[site, { ...site, id: 'exemplo-b', state: 'pausado', pausedReason: 'cota' }]}
        publishNow={publishNow}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publicar agora exemplo-a' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publicar agora exemplo-b' })).toBeNull();
  });

  it('acabou de cadastrar: anuncia a confirmação na região do topo e tira a marca da URL', async () => {
    render(<SitesTable rows={[site]} created="exemplo-a" />);

    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent).toBe('Site exemplo-a cadastrado.'));
    // No topo: a região vem antes da tabela.
    expect(
      status.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith('/sites', { scroll: false });
  });

  it('sem a marca de cadastro a região começa vazia e a URL fica como está', () => {
    render(<SitesTable rows={[site]} />);

    expect(screen.getByRole('status').textContent).toBe('');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sem sites mostra o estado vazio no lugar da tabela (#87)', () => {
    render(<SitesTable rows={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum site cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
