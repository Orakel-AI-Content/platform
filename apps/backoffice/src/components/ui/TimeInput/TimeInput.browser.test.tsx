import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { FormContainer, FormItem } from '../Form';
import { TimeInput } from './index.tsx';

// TimeInput em Chromium (#457; da vitrine, #316): um campo por parte do horário, nomeados pelo
// rótulo do FormItem (a hora) e em pt-BR (minuto, segundo e período), operados por digitação e
// setas, com o foco de 2px em cada um (no escuro, primary-mild: o --ring sobre o gray-700 do
// Input dá 2,91:1).

/** Horário fixo (hora local). */
const HORARIO_INICIAL = new Date(2026, 0, 1, 9, 30);

function formatarHorario(date: Date | null) {
  if (!date) return 'nenhum';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function TimeInputs() {
  const [horario, setHorario] = useState<Date | null>(HORARIO_INICIAL);
  return (
    <section aria-label="TimeInput">
      <FormContainer className="form-width">
        <FormItem label="Horário de publicação">
          <TimeInput value={horario} onChange={setHorario} />
        </FormItem>
        <FormItem label="Horário do lembrete" invalid errorMessage="Informe o horário">
          <TimeInput />
        </FormItem>
        <FormItem label="Horário em 12 h">
          <TimeInput format="12" showSeconds defaultValue={HORARIO_INICIAL} />
        </FormItem>
        <FormItem label="Horário bloqueado">
          <TimeInput disabled defaultValue={HORARIO_INICIAL} />
        </FormItem>
      </FormContainer>
      <p role="status">Horário de publicação: {formatarHorario(horario)}.</p>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('TimeInput no navegador (%s)', (scheme) => {
  it('pelo teclado, com foco de 2px e sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<TimeInputs />);
    expect(await audit(screen.container)).toEqual([]);
    const fieldFocus = focusRing(scheme === 'dark' ? '--primary-mild' : '--ring');

    const status = screen.getByRole('status');
    const hours = screen.getByRole('textbox', { name: 'Horário de publicação' });
    const minutes = screen.getByRole('textbox', { name: 'Minuto' }).first();
    await expect.element(hours).toHaveValue('09');
    await expect.element(minutes).toHaveValue('30');

    // Digitar a hora passa ao minuto; as setas sobem e descem o valor em foco.
    await tabTo(hours);
    await expect.poll(() => outline(hours)).toEqual(fieldFocus);
    // Um dígito por vez: o campo é controlado e o primeiro dígito volta pelo estado (no build
    // de desenvolvimento do React, uma tecla seguida chegaria antes do novo valor).
    await userEvent.keyboard('1');
    await expect.element(hours).toHaveValue('01');
    await userEvent.keyboard('4');
    await expect.element(hours).toHaveValue('14');
    await expect.element(minutes).toHaveFocus();
    await expect.poll(() => outline(minutes)).toEqual(fieldFocus);
    await userEvent.keyboard('{ArrowUp}');
    await expect.element(minutes).toHaveValue('31');
    await expect.element(status).toHaveTextContent('Horário de publicação: 14:31.');
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(status).toHaveTextContent('Horário de publicação: 14:30.');
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(status).toHaveTextContent('Horário de publicação: 14:29.');

    // Limpar: pelo teclado, esvazia os campos e devolve o foco à hora.
    await tabTo(screen.getByRole('button', { name: 'Limpar horário' }).first());
    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Horário de publicação: nenhum.');
    await expect.element(hours).toHaveValue('');
    await expect.element(hours).toHaveFocus();

    // Inválido: o estado e a mensagem chegam aos campos.
    const reminder = screen.getByRole('textbox', { name: 'Horário do lembrete' });
    await expect.element(reminder).toHaveAttribute('aria-invalid', 'true');
    await expect.element(reminder).toHaveAccessibleDescription('Informe o horário');

    // 12 h: o período alterna com as setas.
    const period = screen.getByRole('textbox', { name: 'Período' });
    await expect
      .element(screen.getByRole('textbox', { name: 'Horário em 12 h' }))
      .toHaveValue('09');
    await expect.element(screen.getByRole('textbox', { name: 'Segundo' })).toHaveValue('00');
    await expect.element(period).toHaveValue('am');
    await tabTo(period);
    await userEvent.keyboard('{ArrowUp}');
    await expect.element(period).toHaveValue('pm');

    await expect.element(screen.getByRole('textbox', { name: 'Horário bloqueado' })).toBeDisabled();
  });
});
