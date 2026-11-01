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
import type { ContentListItem } from '@/domain/content/contents.ts';

import { ContentsTable } from './ContentsTable.tsx';

// Lista de conteúdos (#44): status da versão mais recente, links por permissão e teclado.
// Busca, filtros, ordem e paginação com o estado na URL (#107): router.replace simulado.

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
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    usePathname: () => '/sites/exemplo-a/conteudos',
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(navigation.subscribe, navigation.get)),
    useRouter: () => ({ replace: (url: string) => navigation.set(url.split('?')[1] ?? '') }),
  };
});

beforeAll(() => {
  // A dica do botão de editar abre no foco; o happy-dom rejeita a animação nativa que o motion
  // cancela ao desmontar.
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(() => {
  cleanup();
  navigation.set('');
});

const rows: ContentListItem[] = [
  {
    id: 1,
    kind: 'article',
    title: 'Guia de uso',
    slug: 'guia-de-uso',
    status: 'em_revisao',
    version: 3,
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    live: false,
  },
  {
    id: 2,
    kind: 'page',
    title: 'Sobre',
    slug: 'sobre',
    status: 'publicado',
    version: 1,
    updatedAt: new Date('2026-09-20T09:30:00Z'),
    live: true,
  },
];

/** Cor do ponto da tag (o `prefixClass` da Tag do Ecme) em que o texto aparece. */
function tagColor(element: HTMLElement) {
  return element.closest('.tag')?.querySelector('.tag-prefix')?.className;
}

// O filtro é o combobox do react-select: abre com a seta e escolhe a opção pelo nome.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  screen.getByRole('combobox', { name: label }).focus();
  await user.keyboard('{ArrowDown}');
  await user.click(screen.getByRole('option', { name: option }));
}

describe('tabela de conteúdos', () => {
  it('mostra cada conteúdo com tipo e status da versão mais recente', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    const [, first, second] = screen.getAllByRole('row');
    expect(first?.textContent).toContain('Artigo');
    expect(first?.textContent).toContain('Guia de uso');
    expect(first?.textContent).toContain('Em revisão');
    expect(second?.textContent).toContain('Página');
    expect(second?.textContent).toContain('Publicado');
    expect(screen.getByRole('status').textContent).toBe('2 resultados');
  });

  it('dá a cada status a tag da sua cor, com o texto do status (#86)', () => {
    const draft: ContentListItem = {
      ...rows[0]!,
      id: 3,
      title: 'Rascunho novo',
      status: 'rascunho',
    };
    render(
      <ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={[...rows, draft]} />,
    );

    const table = within(screen.getByRole('table'));
    expect(tagColor(table.getByText('Em revisão'))).toContain('bg-warning');
    expect(tagColor(table.getByText('Publicado'))).toContain('bg-success');
    expect(tagColor(table.getByText('Rascunho'))).toContain('bg-gray-400');
  });

  it('sem content.write não tem links de criar nem de editar', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Editar/ })).toBeNull();
  });

  it('com content.write tem o link de editar, e o de criar fica no cabeçalho da página', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} canWrite />);

    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
    const edit = screen.getByRole('link', { name: 'Editar Guia de uso' });
    expect(edit.getAttribute('href')).toBe('/sites/exemplo-a/conteudos/1/editar');
    // Botão de ícone (#441): sem texto visível, o lápis fora da árvore de acessibilidade e o
    // nome lido uma vez, sem a descrição da dica.
    expect(edit.textContent).toBe('');
    expect(edit.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(edit.getAttribute('aria-describedby')).toBeNull();
  });

  it('o teclado alcança o link de versões de cada linha', async () => {
    const user = userEvent.setup();
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    const first = screen.getByRole('link', { name: 'Guia de uso (ver versões)' });
    // Busca, filtros e cabeçalhos ordenáveis vêm antes: o Tab chega ao primeiro link.
    while (document.activeElement !== first) await user.tab();
    expect(first.getAttribute('href')).toBe('/sites/exemplo-a/conteudos/1');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Sobre (ver versões)' }));
  });

  it('sem conteúdo mostra o estado vazio no lugar da tabela, com a ação recebida', () => {
    render(
      <ContentsTable
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        rows={[]}
        canWrite
        emptyAction={<Link href="/sites/exemplo-a/conteudos/novo">Criar conteúdo</Link>}
      />,
    );

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo cadastrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar conteúdo' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/novo',
    );
  });

  it('mostra a data de atualização no fuso do site, com a sigla (#90)', () => {
    const { rerender } = render(
      <ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');

    rerender(<ContentsTable siteId="exemplo-a" timeZone="Europe/Lisbon" rows={rows} />);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });
});

const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0]?.textContent?.replace(' (ver versões)', ''));

const many: ContentListItem[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 10,
  kind: index % 3 === 0 ? 'page' : 'article',
  title: index === 0 ? 'Ação de graças' : `Receita ${String(index).padStart(2, '0')}`,
  slug: `c-${index}`,
  status: index % 2 === 0 ? 'publicado' : 'rascunho',
  version: 1,
  // Mais recente quanto maior o índice.
  updatedAt: new Date(Date.UTC(2026, 8, 1 + index)),
  live: index % 2 === 0,
}));

function renderMany() {
  return render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={many} />);
}

describe('busca, filtros, ordem e paginação (#107)', () => {
  it('sem parâmetros, ordena pela última alteração, da mais recente para a mais antiga', () => {
    renderMany();

    expect(titles().slice(0, 3)).toEqual(['Receita 29', 'Receita 28', 'Receita 27']);
    expect(
      screen.getByRole('columnheader', { name: /Última alteração/ }).getAttribute('aria-sort'),
    ).toBe('descending');
    expect(screen.getByRole('columnheader', { name: 'Versão' }).getAttribute('aria-sort')).toBe(
      null,
    );
  });

  it('busca por palavra do título sem diferenciar maiúsculas e acentos', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'ACAO');

    expect(titles()).toEqual(['Ação de graças']);
    expect(screen.getByRole('status').textContent).toBe('1 resultado');
    expect(navigation.get()).toBe('q=ACAO');
  });

  it('filtros por tipo e status combinam com a busca; "Limpar filtros" zera tudo', async () => {
    const user = userEvent.setup();
    renderMany();

    await choose(user, 'Tipo', 'Página');
    await choose(user, 'Status', 'Rascunho');
    expect(titles()).toEqual([
      'Receita 27',
      'Receita 21',
      'Receita 15',
      'Receita 09',
      'Receita 03',
    ]);
    await user.type(screen.getByLabelText('Buscar por título'), '2');
    expect(titles()).toEqual(['Receita 27', 'Receita 21']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
  });

  it('clicar num cabeçalho ordenável inverte a ordem, com aria-sort no sentido', async () => {
    const user = userEvent.setup();
    renderMany();
    const header = () => screen.getByRole('columnheader', { name: /Título/ });

    await user.click(within(header()).getByRole('button'));
    expect(header().getAttribute('aria-sort')).toBe('ascending');
    expect(titles()[0]).toBe('Ação de graças');
    await user.click(within(header()).getByRole('button'));
    expect(header().getAttribute('aria-sort')).toBe('descending');
    expect(titles()[0]).toBe('Receita 29');
    expect(navigation.get()).toBe('ordem=-title');
  });

  it('tipo e status ordenam pelo rótulo exibido', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.click(
      within(screen.getByRole('columnheader', { name: /Status/ })).getByRole('button'),
    );

    const statuses = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[2]?.textContent);
    expect(statuses[0]).toBe('Publicado');
    expect(statuses.at(-1)).toBe('Rascunho');
  });

  it('25 por página, com contagem e Página anterior/Próxima página', async () => {
    const user = userEvent.setup();
    renderMany();

    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('status').textContent).toBe('30 resultados');
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(navigation.get()).toBe('pagina=2');
  });

  it('a URL de uma lista filtrada, ordenada e paginada restaura o mesmo estado', () => {
    act(() => navigation.set('status=publicado&ordem=title&pagina=1&q=receita'));
    renderMany();

    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('receita');
    expect(screen.getByRole('combobox', { name: 'Status' }).closest('.select')?.textContent).toBe(
      'Publicado',
    );
    expect(titles()[0]).toBe('Receita 02');
    expect(screen.getByRole('status').textContent).toBe('14 resultados');
  });

  it('busca sem resultado mantém a tabela com 0 resultados; "Limpar filtros" volta tudo', async () => {
    const user = userEvent.setup();
    renderMany();

    await user.type(screen.getByLabelText('Buscar por título'), 'inexistente');

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Nenhum conteúdo encontrado.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('0 resultados');
    // A única ação de limpar é a da toolbar (#361).
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    expect(navigation.get()).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Buscar por título').value).toBe('');
    expect(screen.getAllByRole('row')).toHaveLength(26);
  });

  it('o seletor de tamanho troca os itens por página e vai para a URL (#362)', async () => {
    const user = userEvent.setup();
    renderMany();

    await choose(user, 'Itens por página', '10 / página');

    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(navigation.get()).toBe('por-pagina=10');
  });

  it('título longo fica numa linha cortada, com o texto inteiro em title (#362)', () => {
    const title = 'Um título de conteúdo bem comprido, que não cabe na coluna da lista';
    render(
      <ContentsTable
        siteId="exemplo-a"
        timeZone="America/Sao_Paulo"
        rows={[{ ...rows[0]!, title }]}
      />,
    );

    const link = screen.getByRole('link', { name: `${title} (ver versões)` });
    const text = within(link).getByText(title);
    expect(text.getAttribute('title')).toBe(title);
    expect(text.className).toContain('truncate');
  });
});

describe('despublicar em massa (#495)', () => {
  // A confirmação é um diálogo, que esconde o contêiner da app.
  let app: HTMLElement;
  beforeEach(() => {
    app = document.createElement('div');
    app.id = APP_ELEMENT_ID;
    document.body.append(app);
    Modal.setAppElement(app);
  });
  afterEach(async () => {
    act(() => toast.removeAll());
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    app.remove();
  });

  const item = (id: number, title: string, status: ContentListItem['status'], live: boolean) => ({
    id,
    kind: 'article' as const,
    title,
    slug: `c-${id}`,
    status,
    version: 2,
    updatedAt: new Date(Date.UTC(2026, 9, id)),
    live,
  });
  const mixed: ContentListItem[] = [
    item(1, 'Publicado', 'publicado', true),
    item(2, 'Rascunho sobre o publicado', 'rascunho', true),
    item(3, 'Nunca publicado', 'rascunho', false),
    item(4, 'Despublicado', 'despublicado', false),
  ];

  const ok = (): Promise<ActionResult> =>
    Promise.resolve({
      ok: true,
      message: '2 conteúdos despublicados; a trava fica liberada no próximo build.',
    });

  function renderBulk(action = vi.fn(ok), canPublish = true) {
    render(
      <>
        <ContentsTable
          siteId="exemplo-a"
          timeZone="UTC"
          rows={mixed}
          canPublish={canPublish}
          unpublishAction={action}
        />
        <ToastProvider />
      </>,
    );
    return action;
  }

  it('sem content.publish a lista fica sem caixas nem barra', () => {
    renderBulk(vi.fn(ok), false);

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Despublicar em massa' })).toBeNull();
  });

  it('com content.publish só os conteúdos no ar têm caixa, inclusive com rascunho por cima', () => {
    renderBulk();

    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'Selecionar todas as linhas',
      // Mais recente primeiro: 4, 3, 2, 1; o 4 e o 3 não estão no ar.
      'Selecionar Rascunho sobre o publicado',
      'Selecionar Publicado',
    ]);
    // A barra só aparece com seleção.
    expect(screen.queryByRole('button', { name: 'Despublicar em massa' })).toBeNull();
  });

  it('"Selecionar todas" marca só os no ar; a barra diz quantos', async () => {
    const user = userEvent.setup();
    renderBulk();

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));

    expect(screen.getByText('2 conteúdos selecionados')).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Publicado' }));
    expect(screen.getByText('1 conteúdo selecionado')).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar todas as linhas' })
        .indeterminate,
    ).toBe(true);
  });

  it('a confirmação diz quantos saem, o 404 e a trava; confirmar despublica e zera a seleção', async () => {
    const user = userEvent.setup();
    const action = renderBulk();

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));
    await user.click(screen.getByRole('button', { name: 'Despublicar em massa' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Despublicar 2 conteúdos?' });
    expect(dialog.textContent).toContain('Os 2 conteúdos saem do ar');
    expect(dialog.textContent).toContain('404');
    expect(dialog.textContent).toContain('trava de queda de páginas fica liberada');
    await user.click(within(dialog).getByRole('button', { name: 'Despublicar' }));

    expect(action).toHaveBeenCalledWith('exemplo-a', [2, 1]);
    expect(
      await screen.findByText('2 conteúdos despublicados; a trava fica liberada no próximo build.'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Despublicar em massa' })).toBeNull(),
    );
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Selecionar Publicado' }).checked,
    ).toBe(false);
  });

  it('a recusa do lote vai para o Alert e a seleção fica', async () => {
    const user = userEvent.setup();
    renderBulk(
      vi.fn((): Promise<ActionResult> =>
        Promise.resolve({ ok: false, message: 'O conteúdo 2 não está no ar' }),
      ),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Publicado' }));
    await user.click(screen.getByRole('button', { name: 'Despublicar em massa' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Despublicar 1 conteúdo?' });
    await user.click(within(dialog).getByRole('button', { name: 'Despublicar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('O conteúdo 2 não está no ar'),
    );
    expect(screen.getByText('1 conteúdo selecionado')).toBeTruthy();
  });

  it('Cancelar não despublica', async () => {
    const user = userEvent.setup();
    const action = renderBulk();

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Publicado' }));
    await user.click(screen.getByRole('button', { name: 'Despublicar em massa' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
  });

  it('o teclado marca a caixa com Espaço e chega ao botão da barra', async () => {
    const user = userEvent.setup();
    renderBulk();
    const box = screen.getByRole('checkbox', { name: 'Selecionar Rascunho sobre o publicado' });

    box.focus();
    await user.keyboard(' ');
    expect((box as HTMLInputElement).checked).toBe(true);
    const button = screen.getByRole('button', { name: 'Despublicar em massa' });
    // A caixa continua com o foco depois de marcada (as células não remontam).
    expect(document.activeElement).toBe(box);
    while (document.activeElement !== button && document.activeElement !== document.body) {
      await user.tab();
    }
    expect(document.activeElement).toBe(button);
  });

  it('trocar de página zera a seleção', async () => {
    const user = userEvent.setup();
    render(
      <ContentsTable
        siteId="exemplo-a"
        timeZone="UTC"
        rows={many}
        canPublish
        unpublishAction={vi.fn(ok)}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));
    expect(screen.getByText(/conteúdos selecionados/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));

    expect(screen.queryByText(/selecionados?$/)).toBeNull();
  });
});
