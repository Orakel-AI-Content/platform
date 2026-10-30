import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  auditWithout,
  COLOR_SCHEMES,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Dropdown } from './index.ts';

// Dropdown em Chromium (#458; da vitrine, #210): abre por Enter, Espaço e seta para baixo, Esc
// fecha e devolve o foco ao gatilho; as setas pulam o desabilitado, há typeahead e o submenu
// abre com seta para a direita e fecha com seta para a esquerda.

function Dropdowns() {
  const [acao, setAcao] = useState('Nenhuma ação escolhida.');
  return (
    <section aria-label="Dropdown">
      <Dropdown title="Ações do artigo" activeKey="editar">
        <Dropdown.Item variant="header">Artigo</Dropdown.Item>
        <Dropdown.Item eventKey="editar" onSelect={() => setAcao('Ação: editar.')}>
          Editar
        </Dropdown.Item>
        <Dropdown.Item eventKey="duplicar" disabled>
          Duplicar
        </Dropdown.Item>
        <Dropdown.Item eventKey="publicar" onSelect={() => setAcao('Ação: publicar.')}>
          Publicar
        </Dropdown.Item>
        <Dropdown.Item variant="divider" />
        <Dropdown.Menu title="Exportar">
          <Dropdown.Item eventKey="pdf" onSelect={() => setAcao('Ação: exportar PDF.')}>
            PDF
          </Dropdown.Item>
          <Dropdown.Item eventKey="csv" onSelect={() => setAcao('Ação: exportar CSV.')}>
            CSV
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
      <Dropdown title="Indisponível" disabled>
        <Dropdown.Item eventKey="nada">Nada</Dropdown.Item>
      </Dropdown>
      <p role="status">{acao}</p>
    </section>
  );
}

const activeText = () => document.activeElement?.textContent?.trim() ?? '';

/** Os menus abertos ficam opacos depois da transição de abertura (200 ms, no <ul>). */
const menusSettled = () =>
  [...document.querySelectorAll('.dropdown-menu')].every(
    (menu) => getComputedStyle(menu).opacity === '1',
  );

describe('Dropdown no navegador', () => {
  it.each(['{Enter}', ' ', '{ArrowDown}'])(
    'abre com %j, Esc fecha e devolve o foco ao gatilho',
    async (key) => {
      const screen = await renderUi(<Dropdowns />);
      const toggle = screen.getByRole('button', { name: 'Ações do artigo' });

      await tabTo(toggle);
      await expect.element(toggle).toHaveAttribute('aria-haspopup', 'menu');
      await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');

      await userEvent.keyboard(key);
      const menu = page.getByRole('menu');
      await expect.element(menu.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
      await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect.element(toggle).toHaveAttribute('aria-controls', menu.element().id);

      await userEvent.keyboard('{Escape}');
      await expect.element(menu).not.toBeInTheDocument();
      await expect.element(toggle).toHaveFocus();
      await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
    },
  );

  it('setas pulam o desabilitado, typeahead e Enter escolhe e devolve o foco', async () => {
    const screen = await renderUi(<Dropdowns />);
    const toggle = screen.getByRole('button', { name: 'Ações do artigo' });
    const status = screen.getByRole('status');

    (toggle.element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    const menu = page.getByRole('menu');
    await expect
      .poll(() =>
        menu
          .getByRole('menuitem')
          .elements()
          .map((item) => item.textContent?.trim()),
      )
      .toEqual(['Editar', 'Duplicar', 'Publicar', 'Exportar']);
    expect(menu.getByRole('separator').elements()).toHaveLength(1);
    await expect
      .element(menu.getByRole('menuitem', { name: 'Duplicar' }))
      .toHaveAttribute('aria-disabled', 'true');
    await expect.poll(activeText).toBe('Editar');

    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(activeText).toBe('Publicar');
    await userEvent.keyboard('{ArrowUp}');
    await expect.poll(activeText).toBe('Editar');
    await userEvent.keyboard('p');
    await expect.poll(activeText).toBe('Publicar');

    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Ação: publicar.');
    await expect.element(menu).not.toBeInTheDocument();
    await expect.element(toggle).toHaveFocus();

    // O gatilho desabilitado fica fora do Tab.
    const disabled = screen.getByRole('button', { name: 'Indisponível' });
    await expect.element(disabled).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Tab}');
    await expect.element(disabled).not.toHaveFocus();
  });

  it('submenu abre com ArrowRight e fecha com ArrowLeft, devolvendo o foco', async () => {
    const screen = await renderUi(<Dropdowns />);
    const toggle = screen.getByRole('button', { name: 'Ações do artigo' });
    const status = screen.getByRole('status');

    (toggle.element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(activeText).toBe('Editar');
    // As setas não dão a volta na lista (como no Ecme): Editar → Publicar → Exportar.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect.poll(activeText).toBe('Exportar');
    const exportar = page.getByRole('menuitem', { name: 'Exportar' });
    await expect.element(exportar).toHaveAttribute('aria-haspopup', 'menu');

    await userEvent.keyboard('{ArrowRight}');
    const pdf = page.getByRole('menuitem', { name: 'PDF' });
    await expect.element(pdf).toBeVisible();
    await expect.element(pdf).toHaveFocus();
    await expect.element(exportar).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(pdf).not.toBeInTheDocument();
    await expect.element(exportar).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    await expect.element(pdf).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect.element(status).toHaveTextContent('Ação: exportar CSV.');
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    await expect.element(toggle).toHaveFocus();
  });
});

describe.each(COLOR_SCHEMES)('Dropdown no navegador (%s)', (scheme) => {
  it('aberto, com submenu, sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Dropdowns />);

    (screen.getByRole('button', { name: 'Ações do artigo' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(activeText).toBe('Editar');
    // A transição de abertura mistura a cor do texto com o fundo enquanto a opacidade sobe.
    await expect.poll(menusSettled).toBe(true);
    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect.poll(activeText).toBe('Exportar');
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(page.getByRole('menuitem', { name: 'PDF' })).toHaveFocus();
    await expect.poll(menusSettled).toBe(true);
    // Com o submenu aberto, o floating-ui põe um <span aria-owns> no menu pai para o leitor de
    // tela tratar o submenu (em outro portal) como filho dele; o axe acusa
    // `aria-required-children` no `role="menu"`. Só nesta auditoria a regra fica desligada
    // (decisão no segundo escalonamento da #210); com o menu de topo aberto, ela vale.
    expect(await auditWithout(['aria-required-children'])).toEqual([]);
  });
});
