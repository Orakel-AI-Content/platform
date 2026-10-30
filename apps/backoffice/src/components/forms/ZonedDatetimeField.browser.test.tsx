import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';

import { FormsShowcase } from '@/app/(admin)/teste-de-componentes/forms-showcase.tsx';
import { toast } from '@/components/ui/toast';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderInApp } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Data com fuso no SchemaForm em Chromium (#459; da vitrine, #390): com o navegador em UTC, o
// campo mostra a hora de parede de São Paulo, o fuso do site; o painel abre pelo teclado com o
// dia marcado e o Esc devolve o foco ao campo. A fixture é a seção da própria vitrine.

const toastText = () =>
  document.querySelector('[data-toast-placement="top-end"]')?.textContent ?? '';

afterEach(async () => {
  toast.removeAll();
  await commands.emulateTimezone();
});

describe.each(COLOR_SCHEMES)('data com fuso no navegador (%s)', (scheme) => {
  it('pelo teclado, sem violação do axe com o painel aberto', async () => {
    await commands.emulateTimezone('UTC');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<FormsShowcase />);
    const agenda = screen.getByRole('region', { name: 'Data com fuso' });
    const field = agenda.getByRole('combobox', { name: 'Publicar em' });
    const panel = page.getByRole('dialog', { name: 'Escolher data e hora' });

    await expect.element(field).toHaveValue('15/07/2026 13:00');
    await expect.element(field).toHaveAccessibleDescription('Hora de São Paulo, o fuso do site.');

    (field.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(panel).toBeVisible();
    await expect.poll(() => panel.element().contains(document.activeElement)).toBe(true);
    await expect
      .element(panel.getByRole('button', { name: '15 de julho de 2026', pressed: true }))
      .toBeVisible();
    expect(await audit(agenda, panel)).toEqual([]);

    await userEvent.keyboard('{Escape}');
    await expect.element(panel).not.toBeInTheDocument();
    await expect.element(field).toHaveFocus();

    (agenda.getByRole('button', { name: 'Agendar' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(toastText).toContain('Publicação agendada.');
  });
});
