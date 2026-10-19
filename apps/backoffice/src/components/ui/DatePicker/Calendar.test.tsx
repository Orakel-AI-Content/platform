// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Calendar } from '../Calendar/index.ts';

// Calendar do Ecme (#317) com a prop `timeZone`: "hoje" e o dia selecionado são os da hora de
// parede do site, não os do navegador. O processo roda em São Paulo e o site, em Tóquio: às
// 17:00 de 19/10/2026 em São Paulo (20:00 UTC) já são 05:00 de 20/10 em Tóquio.

const NOW = new Date('2026-10-19T20:00:00Z');
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = originalTz;
});

afterEach(cleanup);

const today = () => document.querySelector('[aria-current="date"]');
const selected = () => screen.getAllByRole('button', { pressed: true });

describe('Calendar', () => {
  it('confere o fuso do processo do teste', () => {
    expect(NOW.getDate()).toBe(19);
    expect(NOW.getHours()).toBe(17);
  });

  it('com timeZone, hoje e o dia selecionado são os do fuso do site', () => {
    render(<Calendar value={NOW} timeZone="Asia/Tokyo" />);

    expect(today()?.getAttribute('aria-label')).toBe('20 de outubro de 2026');
    expect(selected().map((day) => day.getAttribute('aria-label'))).toEqual([
      '20 de outubro de 2026',
    ]);
  });

  it('sem timeZone, hoje e o dia selecionado são os do fuso do processo, como no Ecme', () => {
    render(<Calendar value={NOW} />);

    expect(today()?.getAttribute('aria-label')).toBe('19 de outubro de 2026');
    expect(selected().map((day) => day.getAttribute('aria-label'))).toEqual([
      '19 de outubro de 2026',
    ]);
  });

  it('abre no mês de hoje no fuso do site', () => {
    vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
    try {
      // 17:00 de 31/10 em São Paulo, 05:00 de 01/11 em Tóquio.
      render(<Calendar timeZone="Asia/Tokyo" />);
      expect(screen.getByRole('button', { name: 'Nov' })).toBeDefined();
      expect(today()?.getAttribute('aria-label')).toBe('1 de novembro de 2026');
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it('o dia clicado vira o instante daquele dia no fuso, com a hora de parede do valor', async () => {
    const onChange = vi.fn();
    render(<Calendar value={NOW} timeZone="Asia/Tokyo" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '25 de outubro de 2026' }));

    // 05:00 de 25/10 em Tóquio (UTC+9).
    expect((onChange.mock.lastCall?.[0] as Date).toISOString()).toBe('2026-10-24T20:00:00.000Z');
  });

  it('sem valor, o dia clicado é a meia-noite no fuso do site', async () => {
    const onChange = vi.fn();
    render(<Calendar timeZone="Asia/Tokyo" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '25 de outubro de 2026' }));

    expect((onChange.mock.lastCall?.[0] as Date).toISOString()).toBe('2026-10-24T15:00:00.000Z');
  });

  it('a hora de parede atravessa a troca de horário de verão do fuso do site', async () => {
    const onChange = vi.fn();
    // 09:30 de 30/10 em Nova York (EDT, UTC-4); o horário de verão acaba em 01/11.
    render(
      <Calendar
        value={new Date('2026-10-30T13:30:00Z')}
        timeZone="America/New_York"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await userEvent.click(screen.getByRole('button', { name: '2 de novembro de 2026' }));

    // 09:30 de 02/11 em Nova York (EST, UTC-5).
    expect((onChange.mock.lastCall?.[0] as Date).toISOString()).toBe('2026-11-02T14:30:00.000Z');
  });

  it('meses e dias da semana em pt-BR', async () => {
    render(<Calendar value={NOW} timeZone="Asia/Tokyo" />);

    const weekdays = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(weekdays).toEqual(['2ª', '3ª', '4ª', '5ª', '6ª', 'Sá', 'Do']);

    await userEvent.click(screen.getByRole('button', { name: 'Out' }));
    expect(screen.getByRole('button', { name: 'Out', pressed: true })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Fev' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Dez' })).toBeDefined();
  });

  it('setas movem o foco por dia e por semana a partir do selecionado', async () => {
    render(<Calendar value={NOW} timeZone="Asia/Tokyo" />);

    const day = (n: number) => screen.getByRole('button', { name: `${n} de outubro de 2026` });
    expect(day(20).tabIndex).toBe(0);
    expect(day(21).tabIndex).toBe(-1);

    day(20).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(day(21));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(day(28));
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(day(27));
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(day(20));
  });

  it('ao paginar sem valor, o primeiro dia do novo mês recebe o Tab', async () => {
    render(<Calendar timeZone="Asia/Tokyo" />);

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));

    expect(screen.getByRole('button', { name: '1 de novembro de 2026' }).tabIndex).toBe(0);
  });

  it('seleção múltipla compara os dias no fuso do site', async () => {
    const onChange = vi.fn();
    render(<Calendar multipleSelection value={[NOW]} timeZone="Asia/Tokyo" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '20 de outubro de 2026' }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
