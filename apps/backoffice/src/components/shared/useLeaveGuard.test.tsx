// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LEAVE_MESSAGE, useLeaveGuard } from './useLeaveGuard.ts';

// Aviso ao sair (#111): só com alterações, pergunta no clique de link interno e no
// `beforeunload`; ficar cancela o clique antes do indicador de navegação.

vi.mock('next/navigation', () => ({
  usePathname: () => '/sites/exemplo-a/conteudos/1/editar',
  useSearchParams: () => new URLSearchParams(),
}));

const { NavigationIndicator } = await import('./NavigationIndicator.tsx');

// O happy-dom não tem `window.confirm`: cada teste decide a resposta.
const confirm = vi.fn<(message?: string) => boolean>();

beforeEach(() => {
  window.history.replaceState(null, '', '/sites/exemplo-a/conteudos/1/editar');
  confirm.mockReset();
  window.confirm = confirm;
});
afterEach(cleanup);

function Guarded({ active }: { active: boolean }) {
  useLeaveGuard(active);
  return null;
}

/** `followed` registra se o clique chegou ao React (onde o `Link` do Next navegaria). */
function renderWith(active: boolean, link: string) {
  const followed = vi.fn();
  render(
    <>
      <NavigationIndicator />
      <Guarded active={active} />
      {/* Cancela a navegação como o `Link` faria (o happy-dom seguiria o link de verdade). */}
      <span
        onClick={(event) => {
          event.preventDefault();
          followed();
        }}
        dangerouslySetInnerHTML={{ __html: link }}
      />
    </>,
  );
  return followed;
}

const INTERNAL = '<a href="/sites/exemplo-a">Exemplo A</a>';
const status = () => screen.getByRole('status').textContent;

describe('aviso ao sair', () => {
  it('sem alterações não pergunta nada', () => {
    const followed = renderWith(false, INTERNAL);

    fireEvent.click(screen.getByRole('link'));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);

    expect(confirm).not.toHaveBeenCalled();
    expect(followed).toHaveBeenCalled();
    expect(unload.defaultPrevented).toBe(false);
  });

  it('com alterações, link interno pergunta; cancelar fica sem navegar nem acender o indicador', () => {
    confirm.mockReturnValue(false);
    const followed = renderWith(true, INTERNAL);

    fireEvent.click(screen.getByRole('link'));

    expect(confirm).toHaveBeenCalledWith(LEAVE_MESSAGE);
    expect(followed).not.toHaveBeenCalled();
    expect(status()).toBe('');
  });

  it('com alterações, confirmar deixa o clique seguir', () => {
    confirm.mockReturnValue(true);
    const followed = renderWith(true, INTERNAL);

    fireEvent.click(screen.getByRole('link'));

    expect(followed).toHaveBeenCalled();
    expect(status()).toBe('Carregando…');
  });

  it('com alterações, fechar ou recarregar pede a confirmação do navegador', () => {
    renderWith(true, INTERNAL);

    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);

    expect(unload.defaultPrevented).toBe(true);
  });

  it.each([
    ['nova aba', '<a href="/sites" target="_blank">Sites</a>', {}],
    ['download', '<a href="/arquivo.csv" download>CSV</a>', {}],
    ['externo', '<a href="https://example.com/">Fora</a>', {}],
    ['com modificador', INTERNAL, { metaKey: true }],
  ])('%s não é interceptado', (_, link, init) => {
    renderWith(true, link);

    fireEvent.click(screen.getByRole('link'), init);

    expect(confirm).not.toHaveBeenCalled();
  });

  it('desligar (depois de salvar) tira o aviso', () => {
    const { rerender } = render(<Guarded active />);
    rerender(<Guarded active={false} />);

    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);

    expect(unload.defaultPrevented).toBe(false);
  });
});
