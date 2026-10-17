// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabs, type TabsProps } from './index.tsx';

// Tabs do Ecme (#213) no padrão de abas do APG: aba ativa no Tab, setas, Home e End movem e
// ativam pulando a desabilitada, e cada aba liga ao seu painel.

afterEach(cleanup);

const { TabList, TabNav, TabContent } = Tabs;

function Exemplo(props: TabsProps) {
  return (
    <Tabs defaultValue="geral" {...props}>
      <TabList aria-label="Configuração">
        <TabNav value="geral">Geral</TabNav>
        <TabNav value="seo" disabled>
          SEO
        </TabNav>
        <TabNav value="tema" icon={<svg data-icone />}>
          Tema
        </TabNav>
        <TabNav value="avancado">Avançado</TabNav>
      </TabList>
      <TabContent value="geral">Conteúdo geral</TabContent>
      <TabContent value="seo">Conteúdo de SEO</TabContent>
      <TabContent value="tema">Conteúdo do tema</TabContent>
      <TabContent value="avancado">Conteúdo avançado</TabContent>
    </Tabs>
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('Tabs', () => {
  it('lista com nome; aba ativa com aria-selected e única no Tab', () => {
    render(<Exemplo />);

    expect(screen.getByRole('tablist', { name: 'Configuração' }).className).toBe(
      'tab-list tab-list-underline',
    );
    expect(tab('Geral').getAttribute('aria-selected')).toBe('true');
    expect(tab('Geral').tabIndex).toBe(0);
    expect(tab('Tema').getAttribute('aria-selected')).toBe('false');
    expect(tab('Tema').tabIndex).toBe(-1);
    expect(tab('Geral').getAttribute('type')).toBe('button');
  });

  it('aba e painel ligados por aria-controls e aria-labelledby; inativo hidden e vazio', () => {
    render(<Exemplo />);

    const panel = screen.getByRole('tabpanel', { name: 'Geral' });
    expect(tab('Geral').getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Geral').id);
    expect(panel.textContent).toBe('Conteúdo geral');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    const hidden = document.getElementById(tab('Tema').getAttribute('aria-controls')!)!;
    expect(hidden.hidden).toBe(true);
    expect(hidden.textContent).toBe('');
  });

  it('clique ativa a aba; a desabilitada não ativa', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Exemplo onChange={onChange} />);

    await user.click(tab('Tema'));
    expect(tab('Tema').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Tema' }).textContent).toBe('Conteúdo do tema');
    expect(onChange).toHaveBeenLastCalledWith('tema');

    await user.click(tab('SEO'));
    expect(tab('SEO')).toHaveProperty('disabled', true);
    expect(tab('Tema').getAttribute('aria-selected')).toBe('true');
  });

  it('setas movem o foco e ativam, pulando a desabilitada e dando a volta; Home e End', async () => {
    const user = userEvent.setup();
    render(<Exemplo />);

    await user.tab();
    expect(document.activeElement).toBe(tab('Geral'));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('Tema'));
    expect(tab('Tema').getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(tab('Geral'));

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tab('Avançado'));

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tab('Geral'));

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tab('Avançado'));
    expect(tab('Avançado').getAttribute('aria-selected')).toBe('true');
  });

  it('Tab sai da lista para o painel ativo', async () => {
    const user = userEvent.setup();
    render(<Exemplo />);

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tabpanel'));
  });

  it('controlado: segue value e avisa por onChange', async () => {
    const user = userEvent.setup();
    function Controlado() {
      const [value, setValue] = useState('avancado');
      return <Exemplo value={value} onChange={setValue} />;
    }
    render(<Controlado />);

    expect(tab('Avançado').getAttribute('aria-selected')).toBe('true');
    await user.click(tab('Geral'));
    expect(tab('Geral').getAttribute('aria-selected')).toBe('true');
  });

  it('variante pill e ícone decorativo', () => {
    render(<Exemplo variant="pill" defaultValue="tema" />);

    expect(screen.getByRole('tablist').className).toBe('tab-list tab-list-pill');
    expect(tab('Tema').className).toContain('tab-nav-pill');
    expect(tab('Tema').className).toContain('bg-primary');
    expect(tab('Tema').querySelector('.tab-nav-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(tab('Geral').className).not.toContain('bg-primary');
  });

  it('underline: aba ativa com borda primary; desabilitada com tab-nav-disabled', () => {
    render(<Exemplo />);

    expect(tab('Geral').className).toContain('border-primary');
    expect(tab('SEO').className).toContain('tab-nav-disabled');
  });
});
