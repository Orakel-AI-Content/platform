import { describe, expect, it } from 'vitest';

import { audit, COLOR_SCHEMES, setTheme } from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import { PausedSitesAlert } from './PausedSitesAlert.tsx';
import { SiteStateIndicator } from './SiteStatus.tsx';

// Aviso e indicador de site pausado em Chromium (#511): sem violação do axe (WCAG 2.2 AA) nos
// dois temas, com o culpado como link (lista e página do site) e como texto (sem tela própria).

const paused = {
  id: 'receitas',
  name: 'Receitas',
  state: 'pausado' as const,
  pausedReason: 'render: tema "padrao-editorial" não existe nesta release',
};

describe.each(COLOR_SCHEMES)('aviso e indicador de site pausado no navegador (%s)', (scheme) => {
  it('sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(
      <main>
        <PausedSitesAlert sites={[paused, { ...paused, id: 'viagens', name: 'Viagens' }]} />
        <SiteStateIndicator
          site={{ ...paused, pausedCulprit: { origin: 'content', reference: '42' } }}
          compact
        />
        <SiteStateIndicator
          site={{ ...paused, pausedCulprit: { origin: 'content', reference: '42' } }}
        />
        <SiteStateIndicator
          site={{ ...paused, pausedCulprit: { origin: 'redirect', reference: '7' } }}
        />
      </main>,
    );

    await expect.element(screen.getByText('2 sites pausados')).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Receitas' })).toBeVisible();
    expect(await audit()).toEqual([]);
  });
});
