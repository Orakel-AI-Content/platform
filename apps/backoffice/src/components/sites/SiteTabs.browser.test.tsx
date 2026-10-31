import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { SECTION_HINT_CLASS } from '@/components/shared/sectionText.ts';
import Card from '@/components/ui/Card';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';
import { DailyPublishLimitForm } from './SiteActions.tsx';
import { SiteTabs } from './SiteTabs.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Aba "Limite diário" em Chromium (#490): com site.configure, o formulário (também com o erro
// no campo); sem, o cartão só de leitura. Sem violação do axe (WCAG 2.2 AA) nos dois temas.

const intro = (
  <>
    <p className={SECTION_HINT_CLASS}>Quantas publicações o site aceita por dia.</p>
    <p className="text-sm">
      Limite efetivo: <strong>3 por dia, padrão</strong>
    </p>
  </>
);

const saved = () => Promise.resolve({ ok: true as const, message: 'ok' });

async function openLimitTab(dailyLimit: ReactNode) {
  const screen = await renderUi(
    <main>
      <SiteTabs
        lifecycle={<p>Etapas</p>}
        g1={<p>Registro</p>}
        buildWindow={<p>Janela</p>}
        dailyLimit={dailyLimit}
      />
    </main>,
  );
  await screen.getByRole('tab', { name: 'Limite diário' }).click();
  return screen;
}

describe.each(COLOR_SCHEMES)('aba Limite diário no navegador (%s)', (scheme) => {
  it('com o formulário, também com o erro no campo, sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await openLimitTab(
      <DailyPublishLimitForm intro={intro} own={null} action={saved} />,
    );

    const input = screen.getByLabelText(/Limite próprio/);
    await expect.element(input).toBeVisible();
    expect(await audit()).toEqual([]);

    await userEvent.fill(input, '0');
    await screen.getByRole('button', { name: 'Salvar' }).click();
    await expect.element(input).toHaveAttribute('aria-invalid', 'true');
    expect(await audit()).toEqual([]);
  });

  it('só de leitura, sem formulário e sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await openLimitTab(<Card bodyClass="space-y-3">{intro}</Card>);

    await expect.element(screen.getByText('3 por dia, padrão')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salvar' }).query()).toBeNull();
    expect(await audit()).toEqual([]);
  });
});
