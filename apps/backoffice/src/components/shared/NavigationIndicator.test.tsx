// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Indicador de navegação (#77): acende no clique de um link interno para outra tela e apaga
// quando o endereço muda; ignora nova aba, modificadores, download, externo e o mesmo endereço.

const location = vi.hoisted(() => ({ pathname: '/sites', search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));

const { NavigationIndicator } = await import('./NavigationIndicator.tsx');

afterEach(cleanup);
beforeEach(() => {
  location.pathname = '/sites';
  location.search = '';
  window.history.replaceState(null, '', '/sites');
});

const status = () => screen.getByRole('status');

function renderWith(link: string) {
  return render(
    <>
      <NavigationIndicator />
      {/* Cancela a navegação como o `Link` faria (o happy-dom seguiria o link de verdade). */}
      <span
        onClick={(event) => event.preventDefault()}
        dangerouslySetInnerHTML={{ __html: link }}
      />
    </>,
  );
}

describe('indicador de navegação', () => {
  it('em repouso, a região de status existe e está vazia', () => {
    renderWith('<a href="/sites/exemplo-a">exemplo-a</a>');
    expect(status().textContent).toBe('');
  });

  it('acende no clique de um link interno e apaga quando o endereço muda', () => {
    const view = renderWith('<a href="/sites/exemplo-a"><b>exemplo-a</b></a>');
    fireEvent.click(screen.getByText('exemplo-a'));
    expect(status().textContent).toBe('Carregando…');

    location.pathname = '/sites/exemplo-a';
    view.rerender(
      <>
        <NavigationIndicator />
        <span />
      </>,
    );
    expect(status().textContent).toBe('');
  });

  it('apaga também quando só a busca do endereço muda', () => {
    const view = renderWith('<a href="/sites?pagina=2">próxima</a>');
    fireEvent.click(screen.getByText('próxima'));
    expect(status().textContent).toBe('Carregando…');

    location.search = 'pagina=2';
    view.rerender(
      <>
        <NavigationIndicator />
        <span />
      </>,
    );
    expect(status().textContent).toBe('');
  });

  it('ao voltar sem clique ao endereço de onde saiu, continua apagado', () => {
    const view = renderWith('<a href="/sites/exemplo-a">exemplo-a</a>');
    const rerender = () =>
      view.rerender(
        <>
          <NavigationIndicator />
          <span />
        </>,
      );
    fireEvent.click(screen.getByText('exemplo-a'));
    location.pathname = '/sites/exemplo-a';
    rerender();
    // Voltar do navegador (ou router.push depois de salvar), sem clique em link.
    location.pathname = '/sites';
    rerender();
    expect(status().textContent).toBe('');
  });

  it.each([
    ['nova aba', '<a href="/sites/exemplo-a" target="_blank">ir</a>', {}],
    ['download', '<a href="/sites/tfvars" download>ir</a>', {}],
    ['outro site', '<a href="https://exemplo.com/x">ir</a>', {}],
    ['o mesmo endereço', '<a href="/sites">ir</a>', {}],
    ['só a âncora', '<a href="/sites#topo">ir</a>', {}],
    ['com Ctrl', '<a href="/sites/exemplo-a">ir</a>', { ctrlKey: true }],
    ['com Cmd', '<a href="/sites/exemplo-a">ir</a>', { metaKey: true }],
    ['botão do meio', '<a href="/sites/exemplo-a">ir</a>', { button: 1 }],
  ])('não acende: %s', (_, link, init) => {
    renderWith(link);
    fireEvent.click(screen.getByText('ir'), init);
    expect(status().textContent).toBe('');
  });
});
