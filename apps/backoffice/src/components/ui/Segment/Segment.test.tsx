// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Segment } from './index.tsx';

// Segment do Ecme (#315): `role="group"` com nome e cada item um botão alternável
// (`type="button"`, `aria-pressed`), nos dois `selectionType`.

afterEach(cleanup);

describe('Segment', () => {
  it('role="group" com nome; os itens são type="button" com aria-pressed', () => {
    render(
      <Segment aria-label="Visualização" defaultValue="lista">
        <Segment.Item value="lista">Lista</Segment.Item>
        <Segment.Item value="grade">Grade</Segment.Item>
      </Segment>,
    );

    expect(screen.getByRole('group', { name: 'Visualização' }).className).toContain('segment');
    const lista = screen.getByRole('button', { name: 'Lista' });
    const grade = screen.getByRole('button', { name: 'Grade' });
    expect(lista.getAttribute('type')).toBe('button');
    expect(lista.getAttribute('aria-pressed')).toBe('true');
    expect(lista.className).toContain('segment-item-active');
    expect(grade.getAttribute('aria-pressed')).toBe('false');
  });

  it('single: clique troca o item ativo e chama onChange com o valor', async () => {
    const onChange = vi.fn();
    render(
      <Segment aria-label="Período" defaultValue="dia" onChange={onChange}>
        <Segment.Item value="dia">Dia</Segment.Item>
        <Segment.Item value="semana">Semana</Segment.Item>
      </Segment>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(onChange).toHaveBeenLastCalledWith('semana');
    expect(screen.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Dia' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('multiple: Enter e Espaço acrescentam e tiram o valor', async () => {
    const onChange = vi.fn();
    render(
      <Segment
        aria-label="Formatos"
        selectionType="multiple"
        defaultValue={['texto']}
        onChange={onChange}
      >
        <Segment.Item value="texto">Texto</Segment.Item>
        <Segment.Item value="video">Vídeo</Segment.Item>
      </Segment>,
    );

    screen.getByRole('button', { name: 'Vídeo' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['texto', 'video']);
    screen.getByRole('button', { name: 'Texto' }).focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(['video']);
    expect(screen.getByRole('button', { name: 'Texto' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('dentro de um formulário, o item não o envia', async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent)}>
        <Segment aria-label="Ordem">
          <Segment.Item value="asc">Crescente</Segment.Item>
        </Segment>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Crescente' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('item disabled: atributo nativo e sem onChange', async () => {
    const onChange = vi.fn();
    render(
      <Segment aria-label="Status" onChange={onChange}>
        <Segment.Item value="ativo">Ativo</Segment.Item>
        <Segment.Item value="arquivado" disabled>
          Arquivado
        </Segment.Item>
      </Segment>,
    );

    const arquivado = screen.getByRole('button', { name: 'Arquivado' });
    expect(arquivado).toHaveProperty('disabled', true);
    expect(arquivado.className).toContain('segment-item-disabled');
    await userEvent.click(arquivado);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('size do Segment chega aos itens', () => {
    render(
      <Segment aria-label="Tamanho" size="sm">
        <Segment.Item value="a">A</Segment.Item>
      </Segment>,
    );

    expect(screen.getByRole('button', { name: 'A' }).className).toContain('h-10');
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('text-sm');
  });

  it('children como função recebe active e o clique', async () => {
    render(
      <Segment aria-label="Plano" defaultValue="basico">
        <Segment.Item value="basico">
          {({ active, onSegmentItemClick }) => (
            <button type="button" aria-pressed={active} onClick={onSegmentItemClick}>
              Básico
            </button>
          )}
        </Segment.Item>
        <Segment.Item value="pro">
          {({ active, onSegmentItemClick }) => (
            <button type="button" aria-pressed={active} onClick={onSegmentItemClick}>
              Pro
            </button>
          )}
        </Segment.Item>
      </Segment>,
    );

    expect(screen.getByRole('button', { name: 'Básico' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pro' }));
    expect(screen.getByRole('button', { name: 'Pro' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Básico' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
