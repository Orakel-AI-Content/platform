import { redirectUsage } from '@orakel/core/v1';
import { describe, expect, it } from 'vitest';

import { audit, COLOR_SCHEMES, setTheme } from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import { RedirectUsageAlert } from './RedirectUsageAlert.tsx';

// Alerta de redirects em Chromium (#487): sem violação do axe (WCAG 2.2 AA) nos dois temas.

const usage = { ...redirectUsage([]), static: 1500, dynamic: 80, alert: true };

describe.each(COLOR_SCHEMES)('RedirectUsageAlert no navegador (%s)', (scheme) => {
  it('sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(
      <main>
        <RedirectUsageAlert usage={usage} />
      </main>,
    );

    await expect.element(screen.getByText('Redirecionamentos perto do limite')).toBeVisible();
    expect(await audit()).toEqual([]);
  });
});
