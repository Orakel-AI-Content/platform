// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Link from 'next/link';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/components/shared/actionResult.ts';
import { toast, ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { SiteSummary } from '@/domain/sites/sites.ts';

import { SitesTable } from './SitesTable.tsx';

// Registro de instâncias: cada site leva aos seus conteúdos, para qualquer papel (#44). Busca,
// filtro por estado, ordem e paginação com o estado na URL (#364): router.replace simulado.

const navigation = vi.hoisted(() => {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/sites',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => router,
  };
});

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
// "Publicar agora" confirma num diálogo (#327), que esconde o contêiner da app.
let app: HTMLElement;
beforeEach(() => {
  router.replace.mockImplementation((url: string) => navigation.set(url.split('?')[1] ?? ''));
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
  navigation.set('');
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

/** Região viva do toast (a contagem do DataTable também é `role="status"`). */
function toastStatus(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[role="status"][data-toast-placement]');
  if (!region) throw new Error('sem a região do toast');
  return region;
}

/** Contagem "N resultados" do rodapé do DataTable. */
function resultCount(): string | null {
  return document.querySelector('p[role="status"]')?.textContent ?? null;
}

/** Abre o "Mais ações" (Dropdown do Ecme): os itens só existem com a lista aberta. */
async function openMenu(siteId: string) {
  await userEvent.click(screen.getByRole('button', { name: `Mais ações: ${siteId}` }));
  await screen.findByRole('menu');
}

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

/** Nomes dos sites nas linhas da tabela, na ordem em que aparecem. */
function siteNames() {
  return within(screen.getByRole('table'))
    .getAllByRole('link')
    .filter((link) => /^\/sites\/[^/]+$/.test(link.getAttribute('href') ?? ''))
    .map((link) => link.textContent);
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
    await confirmPublish(user, 'exemplo-b');

    await waitFor(() => expect(toastStatus().textContent).toBe('Build de exemplo-b enfileirado.'));
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(publishNow).toHaveBeenCalledWith('exemplo-b');
  });

  it('o erro de "Publicar agora" vai para um único Alert do cartão, acima da tabela, fora da linha', async () => {
    const user = userEvent.setup();
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: false, message: 'Site pausado.' }),
    );
    render(<SitesTable rows={[site, { ...site, id: 'exemplo-b' }]} publishNow={publishNow} />);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Publicar agora exemplo-b' }));
    await confirmPublish(user, 'exemplo-b');

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

    const status = toastStatus();
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

    expect(toastStatus().textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sem sites mostra o estado vazio no lugar da tabela (#87)', () => {
    render(<SitesTable rows={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum site cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('sem sites, o estado vazio repete a ação de cadastrar (#364)', () => {
    render(<SitesTable rows={[]} emptyAction={<Link href="/sites/novo">Cadastrar site</Link>} />);

    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByRole('link', { name: 'Cadastrar site' }).getAttribute('href')).toBe(
      '/sites/novo',
    );
  });
});

describe('busca, filtro e paginação da lista de sites (#364)', () => {
  const rows: SiteSummary[] = [
    site,
    { ...site, id: 'receitas', name: 'Receitas', domain: 'cozinha.example.com' },
    { ...site, id: 'viagens', name: 'Viagens', state: 'pausado', pausedReason: 'cota' },
  ];

  it('a busca acha pelo id e pelo domínio, sem acento nem caixa, e fica na URL', async () => {
    const user = userEvent.setup();
    render(<SitesTable rows={rows} />);
    const search = screen.getByRole('searchbox', { name: 'Buscar por nome, ID ou domínio' });

    await user.type(search, 'COZINHA');
    expect(siteNames()).toEqual(['Receitas']);
    expect(navigation.get()).toBe('q=COZINHA');

    await user.clear(search);
    await user.type(search, 'viagens');
    expect(siteNames()).toEqual(['Viagens']);
  });

  it('o filtro por estado mostra só os sites daquele estado, com o parâmetro na URL', async () => {
    const user = userEvent.setup();
    render(<SitesTable rows={rows} />);

    await choose(user, 'Estado', 'Pausado');
    expect(siteNames()).toEqual(['Viagens']);
    expect(navigation.get()).toBe('estado=pausado');
  });

  it('a URL restaura busca e filtro ao abrir (recarregar mantém a visão)', () => {
    navigation.set('estado=ativo&q=exemplo');
    render(<SitesTable rows={rows} />);

    expect(siteNames()).toEqual(['Exemplo A']);
    expect(
      screen.getByRole<HTMLInputElement>('searchbox', { name: 'Buscar por nome, ID ou domínio' })
        .value,
    ).toBe('exemplo');
  });

  it('busca sem resultado mostra o "nenhum encontrado", não o estado vazio', async () => {
    const user = userEvent.setup();
    render(<SitesTable rows={rows} emptyAction={<Link href="/sites/novo">Cadastrar site</Link>} />);

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por nome, ID ou domínio' }),
      'zzz',
    );
    expect(screen.getByText('Nenhum site encontrado.')).toBeTruthy();
    expect(screen.queryByText('Nenhum site cadastrado.')).toBeNull();
  });

  it('ordena por nome por padrão, com contagem e seletor de tamanho', () => {
    render(<SitesTable rows={[rows[2]!, rows[1]!, rows[0]!]} />);

    expect(siteNames()).toEqual(['Exemplo A', 'Receitas', 'Viagens']);
    expect(resultCount()).toMatch(/^3 resultados$/);
    expect(screen.getByRole('combobox', { name: /por página/i })).toBeTruthy();
  });
});

describe('"Mais ações" do template (#364)', () => {
  it('é o EllipsisButton, sem botão dentro do gatilho focável', () => {
    render(<SitesTable rows={[site]} />);

    const toggle = screen.getByRole('button', { name: 'Mais ações: exemplo-a' });
    expect(toggle.querySelector('button, [role="button"], a, [tabindex]')).toBeNull();
    expect(toggle.querySelector('.button')).not.toBeNull();
    expect(toggle.querySelector('svg')).not.toBeNull();
  });

  it('"Publicar agora" tem o tamanho da página do site (sm)', () => {
    const publishNow = vi.fn((): Promise<ActionResult> =>
      Promise.resolve({ ok: true, message: '' }),
    );
    render(<SitesTable rows={[site]} publishNow={publishNow} />);

    expect(screen.getByRole('button', { name: 'Publicar agora exemplo-a' }).className).toMatch(
      /\btext-sm\b/,
    );
  });
});
