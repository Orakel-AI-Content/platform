// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReturnNotice } from './ReturnNotice.tsx';

// Aviso da devolução pendente (#598): comentário, quem devolveu e quando, no fuso do site.

afterEach(cleanup);

const pending = {
  version: 3,
  reviewer: 'revisor@orakel.local',
  comment: 'Falta a fonte da tabela.\nRevise o título.',
  returnedAt: new Date('2026-11-10T15:30:00Z'),
};

describe('aviso de devolução', () => {
  it('mostra a versão, o comentário com as linhas, quem devolveu e a data no fuso do site', () => {
    render(<ReturnNotice pending={pending} timeZone="America/Sao_Paulo" />);

    expect(screen.getByText('Versão 3 devolvida ao editor')).toBeTruthy();
    const comment = screen.getByText(/Falta a fonte da tabela\./);
    expect(comment.textContent).toBe('Falta a fonte da tabela.\nRevise o título.');
    expect(comment.className).toContain('whitespace-pre-line');
    expect(screen.getByText(/revisor@orakel\.local · 10\/11\/2026, 12:30/)).toBeTruthy();
  });

  it('fica no Alert de aviso do Ecme, sem região viva', () => {
    render(<ReturnNotice pending={pending} timeZone="America/Sao_Paulo" />);

    const alert = screen.getByText('Versão 3 devolvida ao editor').closest('.alert');
    expect(alert?.className).toContain('bg-warning-subtle');
    expect(document.querySelector('[role="alert"], [role="status"]')).toBeNull();
  });
});
