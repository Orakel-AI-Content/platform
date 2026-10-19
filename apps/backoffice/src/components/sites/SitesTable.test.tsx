// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { SitesTable } from './SitesTable.tsx';

// Registro de instâncias: cada site leva aos seus conteúdos, para qualquer papel (#44).

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/sites' }));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
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

/** Abre o "Mais ações" (Dropdown do Ecme): os itens só existem com a lista aberta. */
async function openMenu(siteId: string) {
  await userEvent.click(screen.getByRole('button', { name: `Mais ações: ${siteId}` }));
  await screen.findByRole('menu');
}

/** Cor do ponto da Tag do Ecme com o texto dado. */
function tagColor(element: HTMLElement): string | undefined {
  return element.closest('.tag')?.querySelector('.tag-prefix')?.className;
}

describe('tabela de sites', () => {
  it('tem o link para os conteúdos de cada site, mesmo sem outras ações', async () => {
    render(<SitesTable rows={[site]} />);
    await openMenu('exemplo-a');

    const link = screen.getByRole('menuitem', { name: 'Conteúdos exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/conteudos');
  });

  it('tem o link para a biblioteca de mídia de cada site (#52)', async () => {
    render(<SitesTable rows={[site]} />);
    await openMenu('exemplo-a');

    const link = screen.getByRole('menuitem', { name: 'Mídia exemplo-a' });
    expect(link.getAttribute('href')).toBe('/sites/exemplo-a/midia');
  });

  it('dá a cada estado de site a tag da sua cor, com o texto do estado (#86)', () => {
    render(
      <SitesTable
        rows={[
          site,
          { ...site, id: 'exemplo-b', state: 'promovendo' },
          { ...site, id: 'exemplo-c', state: 'pausado', pausedReason: 'cota' },
        ]}
      />,
    );

    expect(tagColor(screen.getByText('Ativo'))).toContain('bg-success');
    expect(tagColor(screen.getByText('Promovendo'))).toContain('bg-info');
    expect(tagColor(screen.getByText('Pausado'))).toContain('bg-warning');
    // O motivo fica sob a tag, cortado se for longo, com o texto inteiro em `title` (#100).
    expect(screen.getByText('cota').getAttribute('title')).toBe('cota');
  });

  it('dá a cada resultado de build a tag da sua cor (#86)', () => {
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

    // A etapa do ciclo de vida também se chama "Publicado"; a tag é a do último build.
    const [build] = screen
      .getAllByText('Publicado')
      .filter((element) => tagColor(element)?.includes('bg-success'));
    expect(build).toBeTruthy();
    expect(tagColor(screen.getByText('Falhou'))).toContain('bg-error');
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
    expect(link.querySelector('.tag-prefix')?.className).toContain('bg-warning');
    expect(screen.queryByRole('link', { name: /pendentes em exemplo-b/ })).toBeNull();
  });

  it('põe Conteúdos, Mídia e, com site.configure, Editar configuração no menu Mais ações', async () => {
    const menu = async () => {
      await openMenu('exemplo-a');
      const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      return items;
    };
    const { rerender } = render(<SitesTable rows={[site]} />);
    expect(await menu()).toEqual(['Conteúdos exemplo-a', 'Mídia exemplo-a']);

    rerender(<SitesTable rows={[site]} canConfigure />);
    expect(await menu()).toEqual([
      'Conteúdos exemplo-a',
      'Mídia exemplo-a',
      'Editar configuração exemplo-a',
    ]);
  });

  it('"Publicar agora" fica fora do menu e o sucesso vai para o toast', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((siteId: string): Promise<ActionResult> =>
      Promise.resolve({ ok: true, message: `Build de ${siteId} enfileirado.` }),
    );
    render(
      <>
        <SitesTable rows={[site, { ...site, id: 'exemplo-b' }]} publishNow={publishNow} />
        <ToastProvider />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-b' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Build de exemplo-b enfileirado.'),
    );
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(publishNow).toHaveBeenCalledWith('exemplo-b');
  });

  it('o erro de "Publicar agora" vai para um único Alert acima da tabela, fora da linha', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: false, message: 'Site pausado.' }),
    );
    render(<SitesTable rows={[site, { ...site, id: 'exemplo-b' }]} publishNow={publishNow} />);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-b' }));

    const region = screen.getByRole('alert');
    await waitFor(() => expect(region.textContent).toBe('Site pausado.'));
    expect(region.querySelector('.alert')).not.toBeNull();
    expect(
      region.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('site pausado não tem "Publicar agora"; o ativo tem (#155)', () => {
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: true, message: '' }),
    );
    render(
      <SitesTable
        rows={[site, { ...site, id: 'exemplo-b', state: 'pausado', pausedReason: 'cota' }]}
        publishNow={publishNow}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publicar agora exemplo-a' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publicar agora exemplo-b' })).toBeNull();
  });

  it('acabou de cadastrar: anuncia a confirmação no toast e tira a marca da URL', async () => {
    render(
      <>
        <SitesTable rows={[site]} created="exemplo-a" />
        <ToastProvider />
      </>,
    );

    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent).toBe('Site exemplo-a cadastrado.'));
    expect(status.querySelector('.notification')).not.toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/sites', { scroll: false });
  });

  it('sem a marca de cadastro nada é anunciado e a URL fica como está', () => {
    render(
      <>
        <SitesTable rows={[site]} />
        <ToastProvider />
      </>,
    );

    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sem sites mostra o estado vazio no lugar da tabela (#87)', () => {
    render(<SitesTable rows={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum site cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
