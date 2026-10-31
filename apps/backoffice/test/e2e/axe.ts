import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// Axe das telas (#476), com a régua dos testes de componente (`test/browser/a11y.ts`): as tags
// WCAG 2.2 AA, nos dois temas, numa chamada só. Cada tela tem um teste de axe, que passa pelos
// estados abertos (diálogo, menu, seletor) chamando este helper em cada um.

export const WCAG = ['wcag2a', 'wcag2aa', 'wcag22aa'];

const SCHEMES = ['dark', 'light'] as const;

type AxeOptions = {
  /** Só estas regiões (seletores CSS); sem nada, a página inteira. */
  include?: readonly string[];
  /** Regiões de fora, como as guardas de foco do floating-ui (`aria-hidden` e `tabindex=0`). */
  exclude?: readonly string[];
};

/**
 * Sem violação do axe no tema escuro e no claro, nessa ordem: a tela volta ao claro do
 * `emulateMedia` padrão. Sem cookie, o tema é a classe do <html> (#203), trocada aqui como o
 * ThemeSwitcher faz; antes do axe, espera as transições com fim (cores, opacidade), que no meio
 * misturam o texto com o fundo. A falha diz o tema e as regras.
 */
export async function expectNoViolations(
  page: Page,
  { include = [], exclude = [] }: AxeOptions = {},
): Promise<void> {
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(async (mode) => {
      const classes = document.documentElement.classList;
      classes.remove('light', 'dark');
      classes.add(mode);
      // O estilo lido força o cálculo: as transições da troca já existem quando são esperadas.
      void getComputedStyle(document.body).backgroundColor;
      const finite = document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    }, scheme);

    let builder = new AxeBuilder({ page }).withTags(WCAG);
    for (const selector of include) builder = builder.include(selector);
    for (const selector of exclude) builder = builder.exclude(selector);
    const { violations } = await builder.analyze();
    expect(
      violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
      ),
      `axe no tema ${scheme}`,
    ).toEqual([]);
  }
}
