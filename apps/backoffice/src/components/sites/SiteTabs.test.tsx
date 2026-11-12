// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SiteTabs } from './SiteTabs.tsx';

// Abas da página do site (#370): o Card com Publicação (#647; juntou Ciclo de vida e Histórico),
// G1, Janela e Limite diário (#490), a primeira aberta.

afterEach(cleanup);

describe('SiteTabs', () => {
  it('abre na Publicação e troca de aba pelo clique', async () => {
    const user = userEvent.setup();
    render(
      <SiteTabs
        publication={<p>Etapas e histórico</p>}
        g1={<p>Registro</p>}
        buildWindow={<p>Janela</p>}
        dailyLimit={<p>Limite</p>}
      />,
    );

    const list = screen.getByRole('tablist', { name: 'Seções do site' });
    expect(list.closest('.card')).not.toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Publicação',
      'G1 (indexação)',
      'Janela de agrupamento',
      'Limite diário',
    ]);
    expect(screen.queryByRole('tab', { name: 'Ciclo de vida' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Histórico' })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'Publicação' }).textContent).toBe(
      'Etapas e histórico',
    );

    await user.click(screen.getByRole('tab', { name: 'Janela de agrupamento' }));
    expect(screen.getByRole('tabpanel', { name: 'Janela de agrupamento' }).textContent).toBe(
      'Janela',
    );
    expect(screen.queryByText('Etapas e histórico')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Limite diário' }));
    expect(screen.getByRole('tabpanel', { name: 'Limite diário' }).textContent).toBe('Limite');

    await user.click(screen.getByRole('tab', { name: 'G1 (indexação)' }));
    expect(screen.getByRole('tabpanel', { name: 'G1 (indexação)' }).textContent).toBe('Registro');
  });
});
