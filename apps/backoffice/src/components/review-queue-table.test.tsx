// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { ReviewQueueItem } from '@/domain/content/contents.ts';

import { ReviewQueueTable } from './review-queue-table.tsx';

// Fila de revisão (#74): título, tipo, versão e data; links para a revisão e teclado.

afterEach(cleanup);

const rows: ReviewQueueItem[] = [
  {
    id: 3,
    kind: 'page',
    title: 'Quem somos',
    version: 2,
    updatedAt: new Date('2026-10-01T12:00:00Z'),
  },
  {
    id: 1,
    kind: 'article',
    title: 'Guia de uso',
    version: 4,
    updatedAt: new Date('2026-10-02T15:30:00Z'),
  },
];

const renderTable = (data = rows, timeZone = 'America/Sao_Paulo') =>
  render(<ReviewQueueTable siteId="exemplo-a" timeZone={timeZone} rows={data} />);

describe('fila de revisão', () => {
  it('mostra título, tipo, versão e data de cada conteúdo, na ordem recebida', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Título',
      'Tipo',
      'Versão',
      'Enviado em',
    ]);
    const [, first, second] = screen.getAllByRole('row');
    expect(first?.textContent).toContain('Quem somos');
    expect(first?.textContent).toContain('Página');
    expect(first?.textContent).toContain('2');
    expect(first?.textContent).toContain('01/10/2026, 09:00 BRT');
    expect(second?.textContent).toContain('Guia de uso');
    expect(second?.textContent).toContain('Artigo');
    expect(screen.getByText('2 conteúdos aguardando revisão')).toBeTruthy();
  });

  it('o título leva à tela de revisão, com nome acessível, e o teclado alcança cada um', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.tab();
    const first = screen.getByRole('link', { name: 'Quem somos (revisar)' });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('href')).toBe('/sites/exemplo-a/revisao/3');
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Guia de uso (revisar)' }),
    );
  });

  it('mostra a data no fuso do site', () => {
    renderTable(rows, 'Europe/Lisbon');

    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });

  it('fila vazia mostra o estado vazio no lugar da tabela', () => {
    renderTable([]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo aguardando revisão.')).toBeTruthy();
  });
});
