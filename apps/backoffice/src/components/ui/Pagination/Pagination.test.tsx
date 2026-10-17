// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Pagination } from './index.tsx';

// Pagination do Ecme (#214): <nav "Paginação">, uma lista com Anterior, páginas e Próxima como
// botões (ou links com getPageHref), página atual com aria-current e pontas indisponíveis.

afterEach(cleanup);

const nav = () => screen.getByRole('navigation', { name: 'Paginação' });
const page = (n: number) => within(nav()).getByRole('button', { name: `Página ${n}` });
const pageNames = () =>
  within(nav())
    .getAllByRole('button')
    .map((element) => element.getAttribute('aria-label'));

describe('Pagination', () => {
  it('nav "Paginação" com lista; página atual com aria-current; ícones aria-hidden', () => {
    render(<Pagination total={50} pageSize={10} currentPage={2} />);

    expect(nav().className).toBe('pagination');
    expect(within(nav()).getAllByRole('listitem')).toHaveLength(7);
    expect(page(2).getAttribute('aria-current')).toBe('page');
    expect(page(1).hasAttribute('aria-current')).toBe(false);
    expect(page(2).className).toContain('text-primary');
    expect(page(1).className).toContain('pagination-pager-inactive');
    const prev = within(nav()).getByRole('button', { name: 'Página anterior' });
    expect(prev.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Anterior indisponível na primeira página e Próxima na última', () => {
    const { rerender } = render(<Pagination total={30} pageSize={10} currentPage={1} />);

    expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Próxima página' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByRole('button', { name: 'Página anterior' }).className).toContain(
      'pagination-pager-disabled',
    );

    rerender(<Pagination total={30} pageSize={10} currentPage={3} />);
    expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByRole('button', { name: 'Próxima página' })).toHaveProperty('disabled', true);
  });

  it('clique na página, em Próxima e em Anterior avisa onChange e move aria-current', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination total={50} pageSize={10} onChange={onChange} />);

    await user.click(page(3));
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(page(3).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    onChange.mockClear();
    await user.click(page(3));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('operável pelo teclado: Tab passa pelos controles e Enter escolhe a página', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination total={30} pageSize={10} onChange={onChange} />);

    await user.tab();
    expect(document.activeElement).toBe(page(1));
    await user.tab();
    expect(document.activeElement).toBe(page(2));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('com muitas páginas mostra "…" com nome, e eles saltam 5 páginas', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination total={200} pageSize={10} currentPage={10} onChange={onChange} />);

    expect(pageNames()).toEqual([
      'Página anterior',
      'Página 1',
      'Voltar 5 páginas',
      'Página 8',
      'Página 9',
      'Página 10',
      'Página 11',
      'Página 12',
      'Avançar 5 páginas',
      'Página 20',
      'Próxima página',
    ]);

    const more = screen.getByRole('button', { name: 'Avançar 5 páginas' });
    fireEvent.focus(more);
    expect(more.querySelectorAll('svg')).toHaveLength(1);
    await user.click(more);
    expect(onChange).toHaveBeenLastCalledWith(15);

    await user.click(screen.getByRole('button', { name: 'Voltar 5 páginas' }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('getPageHref: links com href, atual com aria-current, ponta sem href e aria-disabled', () => {
    render(
      <Pagination
        total={200}
        pageSize={10}
        currentPage={20}
        getPageHref={(n) => `/artigos?pagina=${n}`}
      />,
    );

    const links = within(nav())
      .getAllByRole('link')
      .filter((link) => link.tagName === 'A');
    expect(
      links.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')]),
    ).toEqual([
      ['Página anterior', '/artigos?pagina=19'],
      ['Página 1', '/artigos?pagina=1'],
      ['Voltar 5 páginas', '/artigos?pagina=15'],
      ['Página 15', '/artigos?pagina=15'],
      ['Página 16', '/artigos?pagina=16'],
      ['Página 17', '/artigos?pagina=17'],
      ['Página 18', '/artigos?pagina=18'],
      ['Página 19', '/artigos?pagina=19'],
      ['Página 20', '/artigos?pagina=20'],
    ]);
    expect(
      within(nav()).getByRole('link', { name: 'Página 20' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(within(nav()).queryAllByRole('button')).toHaveLength(0);

    const next = within(nav()).getByLabelText('Próxima página');
    expect(next.tagName).toBe('SPAN');
    expect(next.getAttribute('role')).toBe('link');
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.hasAttribute('href')).toBe(false);
  });

  it('displayTotal mostra o total em português, no singular e no plural', () => {
    const { rerender } = render(<Pagination total={42} pageSize={10} displayTotal />);
    expect(nav().querySelector('.pagination-total')?.textContent).toBe('Total de 42 itens');

    rerender(<Pagination total={1} pageSize={10} displayTotal />);
    expect(nav().querySelector('.pagination-total')?.textContent).toBe('Total de 1 item');
  });

  it('className do chamador e sem páginas: Anterior e Próxima indisponíveis', () => {
    render(<Pagination total={0} className="mt-4" />);

    expect(nav().className).toBe('pagination mt-4');
    expect(pageNames()).toEqual(['Página anterior', 'Próxima página']);
    expect(screen.getByRole('button', { name: 'Próxima página' })).toHaveProperty('disabled', true);
  });
});
