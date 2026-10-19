// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FormItem } from '../Form';
import { TimeInput } from './index.tsx';

// TimeInput do Ecme (#316): um campo de texto por parte do horário (hora, minuto e, opcionais,
// segundo e período), dentro do Input como <div>; o rótulo e o erro do FormItem vão para os
// campos, não para o <div>.

afterEach(cleanup);

// O happy-dom rejeita a animação nativa que o motion cancela ao desmontar (a mensagem de erro do
// FormItem); aqui ela entra sem animação.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

function at(hours: number, minutes: number) {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function hhmm(date: Date | null | undefined) {
  return date ? [date.getHours(), date.getMinutes()] : date;
}

describe('TimeInput', () => {
  it('24 h por padrão: hora e minuto com nome em pt-BR, sem período', () => {
    render(<TimeInput defaultValue={at(9, 5)} />);

    expect(screen.getByRole('textbox', { name: 'Hora' })).toHaveProperty('value', '09');
    expect(screen.getByRole('textbox', { name: 'Minuto' })).toHaveProperty('value', '05');
    expect(screen.queryByRole('textbox', { name: 'Período' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Segundo' })).toBeNull();
  });

  it('digitar a hora passa o foco ao minuto e o onChange recebe o horário', async () => {
    const onChange = vi.fn();
    render(<TimeInput onChange={onChange} />);

    const hours = screen.getByRole('textbox', { name: 'Hora' });
    const minutes = screen.getByRole('textbox', { name: 'Minuto' });
    await userEvent.click(hours);
    await userEvent.keyboard('14');
    expect(hours).toHaveProperty('value', '14');
    expect(document.activeElement).toBe(minutes);

    await userEvent.keyboard('30');
    expect(minutes).toHaveProperty('value', '30');
    expect(hhmm(onChange.mock.lastCall?.[0] as Date)).toEqual([14, 30]);
  });

  it('um dígito maior que 2 completa a hora e já passa ao minuto', async () => {
    render(<TimeInput />);

    await userEvent.click(screen.getByRole('textbox', { name: 'Hora' }));
    await userEvent.keyboard('7');
    expect(screen.getByRole('textbox', { name: 'Hora' })).toHaveProperty('value', '07');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Minuto' }));
  });

  it('setas sobem e descem dentro dos limites (0–23 e 0–59)', async () => {
    const onChange = vi.fn();
    render(<TimeInput defaultValue={at(23, 0)} onChange={onChange} />);

    const hours = screen.getByRole('textbox', { name: 'Hora' });
    const minutes = screen.getByRole('textbox', { name: 'Minuto' });

    hours.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(hours).toHaveProperty('value', '23');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowDown}');
    expect(hours).toHaveProperty('value', '22');

    minutes.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(minutes).toHaveProperty('value', '00');
    await userEvent.keyboard('{ArrowUp}');
    expect(minutes).toHaveProperty('value', '01');
    expect(hhmm(onChange.mock.lastCall?.[0] as Date)).toEqual([22, 1]);

    minutes.focus();
    for (let i = 0; i < 60; i++) await userEvent.keyboard('{ArrowUp}');
    expect(minutes).toHaveProperty('value', '59');
  });

  it('"Limpar horário" esvazia os campos, devolve null e o foco à hora', async () => {
    const onChange = vi.fn();
    render(<TimeInput defaultValue={at(8, 15)} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Limpar horário' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    const hours = screen.getByRole('textbox', { name: 'Hora' });
    expect(hours).toHaveProperty('value', '');
    expect(screen.getByRole('textbox', { name: 'Minuto' })).toHaveProperty('value', '');
    expect(document.activeElement).toBe(hours);
    expect(screen.queryByRole('button', { name: 'Limpar horário' })).toBeNull();
  });

  it('formato 12: hora de 1 a 12 e período am/pm pelas setas', async () => {
    const onChange = vi.fn();
    render(<TimeInput format="12" defaultValue={at(14, 0)} onChange={onChange} />);

    expect(screen.getByRole('textbox', { name: 'Hora' })).toHaveProperty('value', '02');
    const period = screen.getByRole('textbox', { name: 'Período' });
    expect(period).toHaveProperty('value', 'pm');

    period.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(period).toHaveProperty('value', 'am');
    expect(hhmm(onChange.mock.lastCall?.[0] as Date)).toEqual([2, 0]);
  });

  it('showSeconds acrescenta o campo de segundo', () => {
    render(<TimeInput showSeconds defaultValue={at(1, 2)} />);

    expect(screen.getByRole('textbox', { name: 'Segundo' })).toHaveProperty('value', '00');
  });

  it('desabilitado: os campos ficam desabilitados', () => {
    render(<TimeInput disabled />);

    expect(screen.getByRole('textbox', { name: 'Hora' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('textbox', { name: 'Minuto' })).toHaveProperty('disabled', true);
  });

  it('no FormItem, o rótulo nomeia o campo de hora e o erro fica ligado aos campos', () => {
    const { container } = render(
      <FormItem label="Horário de publicação" invalid errorMessage="Informe o horário">
        <TimeInput />
      </FormItem>,
    );

    const hours = screen.getByLabelText('Horário de publicação');
    expect(hours).toBe(screen.getByRole('textbox', { name: 'Horário de publicação' }));
    expect(hours.getAttribute('aria-invalid')).toBe('true');
    const errorId = hours.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId ?? '')?.textContent).toBe('Informe o horário');

    const minutes = screen.getByRole('textbox', { name: 'Minuto' });
    expect(minutes.getAttribute('aria-invalid')).toBe('true');
    expect(minutes.getAttribute('aria-describedby')).toBe(errorId);

    // O <div> do Input não leva o id do rótulo nem a descrição do erro.
    const wrapper = container.querySelector('.input');
    expect(wrapper?.tagName).toBe('DIV');
    expect(wrapper?.hasAttribute('id')).toBe(false);
    expect(wrapper?.hasAttribute('aria-describedby')).toBe(false);
    expect(wrapper?.className).toContain('input-invalid');
  });
});
