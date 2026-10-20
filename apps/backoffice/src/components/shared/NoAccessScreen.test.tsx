// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LOGOUT_PATH } from '@/components/template/UserProfileDropdown';

import { NoAccessScreen } from './NoAccessScreen.tsx';

// Tela "Sem acesso" (#380): título, motivo, ilustração decorativa e "Sair" pelo Access.

afterEach(cleanup);

describe('tela sem acesso', () => {
  it('mostra o título e o motivo', () => {
    render(<NoAccessScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sem acesso' })).toBeTruthy();
    expect(
      screen.getByText(
        'Sua identidade não tem acesso ao Backoffice. Peça a uma pessoa administradora.',
      ),
    ).toBeTruthy();
  });

  it('"Sair" é um <a> para o logout do Access', () => {
    render(<NoAccessScreen />);
    const sair = screen.getByRole('link', { name: 'Sair' });
    expect(sair.tagName).toBe('A');
    expect(sair.getAttribute('href')).toBe(LOGOUT_PATH);
  });

  it('usa a ilustração SpaceSignBoard, decorativa', () => {
    const { container } = render(<NoAccessScreen />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('280');
  });
});
