import { describe, expect, it } from 'vitest';
import { userEvent, type Locator } from 'vitest/browser';

import { StatesShowcase } from '@/app/(admin)/teste-de-componentes/states-showcase.tsx';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setReducedMotion,
  setTheme,
} from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';

// Cabeçalho de página e peças de estado em Chromium (#459; da vitrine, #388): a trilha nomeada
// com o item atual em aria-current, as seis cores do StateTag, a etapa atual do ciclo com
// aria-current="step" e a ação na etapa seguinte; por tema, o foco de 2px no --ring nos links e
// nas ações, e o axe em cada seção. A fixture é a seção da própria vitrine.

const SECTIONS = ['PageHeader', 'StatusScreen', 'StateTag', 'LifecycleSteps'] as const;

/** Põe o foco no h2 da seção, para o próximo Tab entrar nela. */
function focusSection(region: Locator): void {
  const heading = region.element().querySelector<HTMLElement>('h2')!;
  heading.setAttribute('tabindex', '-1');
  heading.focus();
}

const currentStep = (list: Element) => list.querySelector('[aria-current="step"]')?.textContent;

describe('cabeçalho e estados no navegador', () => {
  it('trilha, status em seis cores e ciclo com a etapa atual', async () => {
    const screen = await renderUi(<StatesShowcase />);

    const header = screen.getByRole('region', { name: 'PageHeader' });
    const trail = header.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(trail.getByRole('listitem').elements()).toHaveLength(3);
    expect(
      trail
        .getByRole('link')
        .elements()
        .map((link) => link.textContent),
    ).toEqual(['Sites', 'Portal Exemplo']);
    await expect
      .element(trail.getByText('Mudanças pendentes'))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(header.getByRole('heading', { level: 1, name: 'Mudanças pendentes' }))
      .toBeVisible();
    await expect.element(header.getByRole('link', { name: 'Criar conteúdo' })).toBeVisible();

    const status = screen
      .getByRole('region', { name: 'StatusScreen' })
      .getByRole('region', { name: 'Página não encontrada' });
    await expect
      .element(status.getByRole('heading', { level: 1 }))
      .toHaveTextContent('Página não encontrada');
    expect(status.element().querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1);
    await expect.element(status.getByRole('link', { name: 'Voltar para os sites' })).toBeVisible();

    const tags = screen.getByRole('region', { name: 'StateTag' }).getByRole('listitem').elements();
    expect(tags.map((tag) => tag.textContent)).toEqual([
      'Rascunho',
      'Em revisão',
      'Aprovado',
      'Agendado',
      'Publicado',
      'Despublicado',
    ]);
    const dots = tags.map(
      (tag) => getComputedStyle(tag.querySelector('.tag-affix')!).backgroundColor,
    );
    expect(new Set(dots).size).toBe(6);

    const steps = screen.getByRole('region', { name: 'LifecycleSteps' });
    const [withAction, done] = steps.getByRole('list').elements();
    expect(currentStep(withAction!)).toContain('Infra aplicada');
    expect(withAction!.querySelectorAll('button')).toHaveLength(1);
    expect(currentStep(done!)).toContain('Publicado');
    expect(done!.querySelectorAll('button')).toHaveLength(0);

    // A ação avança a etapa até a última, onde some.
    const advance = steps.getByRole('button', { name: 'Avançar etapa' });
    await advance.click();
    await expect.poll(() => currentStep(withAction!)).toContain('Zona ativa');
    await advance.click();
    await expect.poll(() => currentStep(withAction!)).toContain('Publicado');
    expect(steps.getByRole('button').elements()).toHaveLength(0);
  });
});

describe.each(COLOR_SCHEMES)('cabeçalho e estados no navegador (%s)', (scheme) => {
  it('pelo teclado, com foco de 2px e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<StatesShowcase />);
    const region = (name: string) => screen.getByRole('region', { name, exact: true });

    const header = region('PageHeader');
    focusSection(header);
    for (const name of ['Sites', 'Portal Exemplo', 'Criar conteúdo']) {
      const target = header.getByRole('link', { name });
      await userEvent.keyboard('{Tab}');
      await expect.element(target).toHaveFocus();
      expect(outline(target)).toEqual(focusRing());
    }

    const back = region('StatusScreen').getByRole('link', { name: 'Voltar para os sites' });
    focusSection(region('StatusScreen'));
    await userEvent.keyboard('{Tab}');
    await expect.element(back).toHaveFocus();
    expect(outline(back)).toEqual(focusRing());

    const steps = region('LifecycleSteps');
    const advance = steps.getByRole('button', { name: 'Avançar etapa' });
    focusSection(steps);
    await userEvent.keyboard('{Tab}');
    await expect.element(advance).toHaveFocus();
    expect(outline(advance)).toEqual(focusRing());
    await userEvent.keyboard('{Enter}');
    await expect
      .poll(() => currentStep(steps.getByRole('list').elements()[0]!))
      .toContain('Zona ativa');

    for (const name of SECTIONS) {
      expect(await audit(region(name)), name).toEqual([]);
      await expect.element(region(name).getByRole('heading', { level: 2 })).toHaveTextContent(name);
    }
  });
});
