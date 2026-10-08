// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { SchemaForm } from './schema-form.tsx';
import { isoToLocal, localToIso, zonedDateTimeField } from './zoned-datetime-field.tsx';

// Data de publicação no fuso do site (#183): hora de parede ↔ ISO com o offset do fuso.

afterEach(cleanup);

describe('conversão no fuso do site', () => {
  it('São Paulo: 06/10/2026 12:00 grava com -03:00', () => {
    expect(localToIso('2026-10-06T12:00', 'America/Sao_Paulo')).toBe('2026-10-06T12:00:00-03:00');
  });

  it('Lisboa: julho grava com +01:00 e dezembro com +00:00 (horário de verão)', () => {
    expect(localToIso('2026-07-15T09:30', 'Europe/Lisbon')).toBe('2026-07-15T09:30:00+01:00');
    expect(localToIso('2026-12-15T09:30', 'Europe/Lisbon')).toBe('2026-12-15T09:30:00+00:00');
  });

  it('ida e volta: a data reaberta aparece igual à informada', () => {
    for (const [local, timeZone] of [
      ['2026-10-06T12:00', 'America/Sao_Paulo'],
      ['2026-07-15T09:30', 'Europe/Lisbon'],
      ['2026-12-31T23:59', 'Europe/Lisbon'],
      ['2026-03-08T07:15', 'America/New_York'],
    ] as const) {
      const iso = localToIso(local, timeZone);
      expect(iso).toBeDefined();
      expect(isoToLocal(iso ?? '', timeZone)).toBe(local);
    }
  });

  it('valor gravado com outro offset aparece convertido para o fuso do site', () => {
    expect(isoToLocal('2026-10-06T15:00:00Z', 'America/Sao_Paulo')).toBe('2026-10-06T12:00');
    expect(isoToLocal('2026-07-15T12:00:00-03:00', 'Europe/Lisbon')).toBe('2026-07-15T16:00');
  });

  it('troca de horário: hora repetida usa o primeiro offset; inexistente, o de depois', () => {
    // Lisboa, 25/10/2026: 02:00 de verão volta para 01:00, e 01:30 acontece duas vezes.
    expect(localToIso('2026-10-25T01:30', 'Europe/Lisbon')).toBe('2026-10-25T01:30:00+01:00');
    // Lisboa, 29/03/2026: 01:00 pula para 02:00, e 01:30 não existe.
    expect(localToIso('2026-03-29T01:30', 'Europe/Lisbon')).toBe('2026-03-29T01:30:00+01:00');
  });

  it('texto que não é data: undefined na ida e vazio na volta', () => {
    expect(localToIso('', 'Europe/Lisbon')).toBeUndefined();
    expect(isoToLocal('não é data', 'Europe/Lisbon')).toBe('');
  });
});

describe('campo no gerador', () => {
  const schema = z.object({ publishedAt: z.iso.datetime({ offset: true }) });

  function renderField(value: string, onSubmit = vi.fn()) {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ publishedAt: value }}
        labels={{ publishedAt: 'Data de publicação' }}
        hints={{ publishedAt: 'Horário de Europe/Lisbon' }}
        fields={{ publishedAt: zonedDateTimeField('Europe/Lisbon') }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }

  it('é um seletor de data e hora com o valor no fuso do site e a dica do fuso', () => {
    renderField('2026-07-15T12:00:00-03:00');

    const input = screen.getByLabelText('Data de publicação');
    expect(input.getAttribute('type')).toBe('datetime-local');
    expect((input as HTMLInputElement).value).toBe('2026-07-15T16:00');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Horário de Europe/Lisbon',
    );
  });

  it('mudar a data grava ISO com o offset do site; sem mexer, o valor segue como veio', async () => {
    const user = userEvent.setup();
    const untouched = renderField('2026-07-15T12:00:30Z');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(untouched).toHaveBeenCalled());
    expect(untouched.mock.calls[0]?.[0]).toEqual({ publishedAt: '2026-07-15T12:00:30Z' });
    cleanup();

    const changed = renderField('2026-07-15T12:00:00Z');
    fireEvent.change(screen.getByLabelText('Data de publicação'), {
      target: { value: '2026-12-01T08:45' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(changed.mock.calls[0]?.[0]).toEqual({ publishedAt: '2026-12-01T08:45:00+00:00' });
  });
});
