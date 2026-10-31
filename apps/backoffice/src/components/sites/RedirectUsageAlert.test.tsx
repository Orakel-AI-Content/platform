// @vitest-environment happy-dom
import { redirectUsage } from '@orakel/core/v1';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RedirectUsageAlert } from './RedirectUsageAlert.tsx';

// Alerta de redirects (#487): título de aviso e o uso de cada tipo contra o limite do core.

afterEach(cleanup);

describe('RedirectUsageAlert', () => {
  it('mostra o uso e o limite de estáticos e dinâmicos', () => {
    const usage = { ...redirectUsage([]), static: 1500, dynamic: 12 };
    render(<RedirectUsageAlert usage={usage} />);

    expect(screen.getByText('Redirecionamentos perto do limite')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual(['Estáticos: 1.500 de 2.000', 'Dinâmicos: 12 de 100']);
  });
});
