import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  outline,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Card } from '../Card';
import { Tabs } from './index.tsx';

// Tabs em Chromium (#459; da vitrine, #213): padrão do APG — só a aba ativa no Tab, setas e
// Home/End movem e ativam pulando a desabilitada, e o painel é ligado à aba.

function TabsDemo() {
  return (
    <section aria-label="Tabs" className="space-y-3">
      <Card>
        <Tabs defaultValue="geral">
          <Tabs.TabList aria-label="Configuração do site">
            <Tabs.TabNav value="geral">Geral</Tabs.TabNav>
            <Tabs.TabNav value="seo" disabled>
              SEO
            </Tabs.TabNav>
            <Tabs.TabNav value="tema">Tema</Tabs.TabNav>
          </Tabs.TabList>
          <Tabs.TabContent value="geral" className="pt-4">
            Nome, domínio e idioma do site.
          </Tabs.TabContent>
          <Tabs.TabContent value="seo" className="pt-4">
            Título e descrição padrão.
          </Tabs.TabContent>
          <Tabs.TabContent value="tema" className="pt-4">
            Cores e fontes do site.
          </Tabs.TabContent>
        </Tabs>
      </Card>
      <Card>
        <Tabs defaultValue="rascunhos" variant="pill">
          <Tabs.TabList aria-label="Filtro de artigos">
            <Tabs.TabNav value="rascunhos">Rascunhos</Tabs.TabNav>
            <Tabs.TabNav value="publicados">Publicados</Tabs.TabNav>
          </Tabs.TabList>
          <Tabs.TabContent value="rascunhos" className="pt-4">
            2 rascunhos.
          </Tabs.TabContent>
          <Tabs.TabContent value="publicados" className="pt-4">
            10 publicados.
          </Tabs.TabContent>
        </Tabs>
      </Card>
    </section>
  );
}

describe('Tabs no navegador', () => {
  it('só a aba ativa no Tab; setas pulam a desabilitada, Home e End; Tab vai ao painel', async () => {
    const screen = await renderUi(<TabsDemo />);
    const list = screen.getByRole('tablist', { name: 'Configuração do site' });
    const tab = (name: string) => list.getByRole('tab', { name });
    const panel = () => screen.getByRole('tabpanel').first();

    await tabTo(tab('Geral'));
    await expect.element(tab('Geral')).toHaveAttribute('aria-selected', 'true');
    await expect.element(tab('SEO')).toBeDisabled();
    await expect.element(panel()).toHaveTextContent('Nome, domínio e idioma do site.');
    await expect.element(panel()).toHaveAttribute('aria-labelledby', tab('Geral').element().id);

    await userEvent.keyboard('{ArrowRight}');
    await expect.element(tab('Tema')).toHaveFocus();
    await expect.element(tab('Tema')).toHaveAttribute('aria-selected', 'true');
    await expect.element(tab('Geral')).toHaveAttribute('aria-selected', 'false');
    await expect.element(panel()).toHaveTextContent('Cores e fontes do site.');

    await userEvent.keyboard('{ArrowRight}');
    await expect.element(tab('Geral')).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect.element(tab('Tema')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    await expect.element(tab('Geral')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(tab('Tema')).toHaveFocus();

    // Foco de 2px na aba, como no resto da vitrine.
    const { style, width } = outline(tab('Tema'));
    expect({ style, width }).toEqual({ style: 'solid', width: '2px' });

    await userEvent.keyboard('{Tab}');
    await expect.element(panel()).toHaveFocus();
    await expect.element(panel()).toHaveAttribute('aria-labelledby', tab('Tema').element().id);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    await expect.element(tab('Tema')).toHaveFocus();
  });
});

describe.each(COLOR_SCHEMES)('Tabs no navegador (%s)', (scheme) => {
  it('com outra aba ativa sem violação do axe', async () => {
    // Sem a transição de cor da aba (motion-reduce:transition-none), o axe mede a cor final.
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<TabsDemo />);

    await screen.getByRole('tab', { name: 'Tema' }).click();
    await screen.getByRole('tab', { name: 'Publicados' }).click();
    await expect
      .element(screen.getByRole('tab', { name: 'Publicados' }))
      .toHaveAttribute('aria-selected', 'true');
    expect(await audit(screen.container)).toEqual([]);
  });
});
