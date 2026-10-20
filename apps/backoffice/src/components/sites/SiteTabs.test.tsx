// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SiteTabs } from './SiteTabs.tsx';

// Abas da página do site (#370): o Card com Ciclo de vida, G1 e Janela, a primeira aberta.

afterEach(cleanup);

describe('SiteTabs', () => {
  it('abre no Ciclo de vida e troca de aba pelo clique', async () => {
    const user = userEvent.setup();
    render(<SiteTabs lifecycle={<p>Etapas</p>} g1={<p>Registro</p>} buildWindow={<p>Janela</p>} />);

    const list = screen.getByRole('tablist', { name: 'Seções do site' });
    expect(list.closest('.card')).not.toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Ciclo de vida',
      'G1 (indexação)',
      'Janela de agrupamento',
    ]);
    expect(screen.getByRole('tabpanel', { name: 'Ciclo de vida' }).textContent).toBe('Etapas');

    await user.click(screen.getByRole('tab', { name: 'Janela de agrupamento' }));
    expect(screen.getByRole('tabpanel', { name: 'Janela de agrupamento' }).textContent).toBe(
      'Janela',
    );
    expect(screen.queryByText('Etapas')).toBeNull();
  });
});
