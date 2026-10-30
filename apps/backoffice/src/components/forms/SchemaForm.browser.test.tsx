import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { FormsShowcase } from '@/app/(admin)/teste-de-componentes/forms-showcase.tsx';
import { toast } from '@/components/ui/toast';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderInApp } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// SchemaForm em Chromium (#459; da vitrine, #390): de tela e em cartão, pelo teclado — o envio
// inválido marca o campo, leva o foco a ele e lista o erro no resumo, que leva de volta ao
// campo; o envio válido mostra o toast. A fixture é a seção da própria vitrine, com o envio no
// cliente.

const toastText = () =>
  document.querySelector('[data-toast-placement="top-end"]')?.textContent ?? '';

afterEach(() => {
  toast.removeAll();
});

describe.each(COLOR_SCHEMES)('SchemaForm no navegador (%s)', (scheme) => {
  it('de tela e em cartão pelo teclado: erro no campo, resumo e toast, sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<FormsShowcase />);
    const forms = screen.getByRole('region', { name: 'SchemaForm' });

    // De tela: título obrigatório vazio; Enter no envio marca o campo, leva o foco a ele e
    // lista o erro no resumo, que leva de volta ao campo.
    const create = forms.getByRole('button', { name: 'Criar matéria' });
    await expect.element(forms.getByRole('button', { name: 'Descartar' })).toBeVisible();
    (create.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const title = forms.getByRole('textbox', { name: 'Título' }).first();
    await expect.element(title).toHaveAttribute('aria-invalid', 'true');
    await expect.element(title).toHaveAccessibleDescription('Informe o título');
    await expect.element(title).toHaveFocus();
    const summary = forms.getByRole('button', { name: 'Título: Informe o título' });
    (summary.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(title).toHaveFocus();

    expect(await audit(forms)).toEqual([]);

    await userEvent.keyboard('Nova matéria');
    (create.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(toastText).toContain('Matéria criada.');
    await expect.element(title).toHaveAttribute('aria-invalid', 'false');

    // Em cartão: apagar o título e enviar com Enter no próprio campo.
    const cardTitle = forms.getByRole('textbox', { name: 'Título' }).last();
    await expect.element(cardTitle).toHaveValue('Matéria de exemplo');
    await expect
      .element(forms.getByRole('checkbox', { name: 'Destaque na capa' }).last())
      .toBeChecked();
    (cardTitle.element() as HTMLElement).focus();
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}{Backspace}{Enter}');
    await expect.element(cardTitle).toHaveAttribute('aria-invalid', 'true');
    await expect.element(cardTitle).toHaveFocus();
    await userEvent.keyboard('Outra matéria{Enter}');
    await expect.poll(toastText).toContain('Matéria salva.');
  });
});
