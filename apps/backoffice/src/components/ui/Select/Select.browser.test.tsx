import AsyncSelect from 'react-select/async';
import CreatableSelect from 'react-select/creatable';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { audit, COLOR_SCHEMES, setTheme, tabTo } from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { FormContainer, FormItem } from '../Form';
import { Select } from './index.tsx';

// Select em Chromium (#457; da vitrine, #208 e #319): o react-select operado só pelo teclado,
// com o rótulo do FormItem; no múltiplo, "Remover <opção>" por valor e região viva em pt-BR;
// e os modos inválido, async e creatable.

type Opcao = { value: string; label: string };

const CATEGORIAS: Opcao[] = [
  { value: 'noticias', label: 'Notícias' },
  { value: 'guias', label: 'Guias' },
  { value: 'resenhas', label: 'Resenhas' },
  { value: 'entrevistas', label: 'Entrevistas' },
];

const SITES: Opcao[] = [
  { value: 'exemplo-a', label: 'Exemplo A' },
  { value: 'exemplo-b', label: 'Exemplo B' },
  { value: 'receitas', label: 'Receitas da casa' },
];

/** Busca do Select async sem rede: filtra a lista local. */
function buscarSites(termo: string): Promise<Opcao[]> {
  const normalizado = termo.toLowerCase();
  return Promise.resolve(SITES.filter((site) => site.label.toLowerCase().includes(normalizado)));
}

function Selects() {
  return (
    <section aria-label="Select">
      <FormContainer className="form-width">
        <FormItem label="Categoria">
          <Select<Opcao> options={CATEGORIAS} placeholder="Escolha a categoria" />
        </FormItem>
        <FormItem label="Categorias secundárias">
          <Select<Opcao, true>
            isMulti
            options={CATEGORIAS}
            defaultValue={[CATEGORIAS[1]!, CATEGORIAS[2]!]}
          />
        </FormItem>
        <FormItem label="Seção" invalid errorMessage="Escolha uma seção">
          <Select<Opcao> options={CATEGORIAS} placeholder="Nenhuma seção" />
        </FormItem>
        <FormItem label="Site">
          <Select<Opcao>
            componentAs={AsyncSelect}
            loadOptions={buscarSites}
            defaultOptions
            placeholder="Busque pelo nome"
          />
        </FormItem>
        <FormItem label="Palavra-chave">
          <Select<Opcao>
            componentAs={CreatableSelect}
            options={CATEGORIAS}
            placeholder="Escolha ou crie"
            formatCreateLabel={(valor) => `Criar "${valor}"`}
          />
        </FormItem>
      </FormContainer>
    </section>
  );
}

/** Textos dos elementos da classe dentro do contêiner (as peças do react-select não têm papel). */
const texts = (root: Element, selector: string) =>
  [...root.querySelectorAll(selector)].map((element) => element.textContent);

describe.each(COLOR_SCHEMES)('Select no navegador (%s)', (scheme) => {
  it('pelo teclado: rótulo, setas, Enter e Esc, sem violação do axe com o menu aberto', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Selects />);
    const root = screen.container;

    const categoria = screen.getByRole('combobox', { name: 'Categoria', exact: true });
    (categoria.element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(categoria).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');

    // A opção em foco tem fundo próprio, diferente das outras.
    await expect.poll(() => texts(root, '.select-option')).toHaveLength(4);
    await expect.poll(() => texts(root, '.select-option-focused')).toEqual(['Guias']);
    const background = (selector: string) =>
      getComputedStyle(root.querySelector(selector)!).backgroundColor;
    expect(background('.select-option-focused')).not.toBe(background('.select-option'));

    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Enter}');
    await expect.poll(() => texts(root, '.select-single-value')[0]).toBe('Guias');
    await expect.element(categoria).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    await expect.element(categoria).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await expect.element(categoria).toHaveAttribute('aria-expanded', 'false');
    expect(root.querySelector('.select-menu')).toBeNull();
  });

  it('múltiplo pelo teclado: adiciona, remove e anuncia em pt-BR, sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Selects />);
    const combobox = screen.getByRole('combobox', { name: 'Categorias secundárias' });
    const multi = combobox.element().closest('.select')!;
    const values = () => texts(multi, '.select-multi-value-label');
    const live = () => multi.querySelector('[role="log"]')?.textContent ?? '';

    expect(values()).toEqual(['Guias', 'Resenhas']);
    await expect.element(screen.getByRole('button', { name: 'Remover Guias' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Remover Resenhas' })).toBeVisible();
    expect(multi.querySelectorAll('[aria-label^="Remove "]')).toHaveLength(0);

    await tabTo(combobox);
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(combobox).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => texts(multi, '.select-option-focused')).toEqual(['Notícias']);

    expect(await audit()).toEqual([]);

    await userEvent.keyboard('{Enter}');
    await expect.poll(values).toEqual(['Guias', 'Resenhas', 'Notícias']);
    await expect.element(combobox).toHaveFocus();
    await expect.poll(live).toContain('opção Notícias selecionada.');

    await userEvent.keyboard('{Backspace}');
    await expect.poll(values).toEqual(['Guias', 'Resenhas']);
    await expect.poll(live).toContain('opção Notícias removida.');

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    await expect.poll(live).toContain('valor Guias em foco, 1 de 2.');
    // O valor em foco tem anel visível; o outro, não.
    const chip = (label: string) =>
      [...multi.querySelectorAll('.select-multi-value')].find((element) =>
        element.textContent?.includes(label),
      )!;
    expect(chip('Guias').classList.contains('select-multi-value-focused')).toBe(true);
    expect(getComputedStyle(chip('Guias')).boxShadow).not.toBe(
      getComputedStyle(chip('Resenhas')).boxShadow,
    );
    await userEvent.keyboard('{Backspace}');
    await expect.poll(values).toEqual(['Resenhas']);
    expect(live()).not.toMatch(/selected|deselected|focused/);

    expect(await audit()).toEqual([]);
  });
});

describe('Select no navegador', () => {
  it('em FormItem inválido, async e creatable', async () => {
    const screen = await renderUi(<Selects />);
    const root = screen.container;

    const secao = screen.getByRole('combobox', { name: 'Seção' });
    await expect.element(secao).toHaveAttribute('aria-invalid', 'true');
    const errorId = secao.element().getAttribute('aria-errormessage');
    expect(document.getElementById(errorId!)?.textContent).toBe('Escolha uma seção');

    const site = screen.getByRole('combobox', { name: 'Site' });
    (site.element() as HTMLElement).focus();
    await userEvent.keyboard('rece');
    await expect.poll(() => texts(root, '.select-option')).toEqual(['Receitas da casa']);
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => texts(root, '.select-single-value')).toContain('Receitas da casa');

    const palavra = screen.getByRole('combobox', { name: 'Palavra-chave' });
    (palavra.element() as HTMLElement).focus();
    await userEvent.keyboard('Podcasts');
    await expect.poll(() => texts(root, '.select-option-focused')).toEqual(['Criar "Podcasts"']);
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => texts(root, '.select-single-value')).toContain('Podcasts');
  });
});
