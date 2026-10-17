// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './index.tsx';

// Button do Ecme (#205): variantes com as cores do template (o `solid` com texto escuro no tema
// escuro), `disabled` como atributo nativo e `loading` anunciado sem perder o foco.

afterEach(cleanup);

describe('Button', () => {
  it('variantes: solid, plain e default (padrão), com a classe base do Ecme', () => {
    render(
      <>
        <Button variant="solid">Salvar</Button>
        <Button variant="plain">Cancelar</Button>
        <Button>Voltar</Button>
      </>,
    );

    const solid = screen.getByRole('button', { name: 'Salvar' });
    expect(solid.className).toContain('button');
    expect(solid.className).toContain('bg-primary');
    expect(solid.className).toContain('text-neutral');
    expect(solid.className).toContain('dark:text-gray-950');
    expect(solid.className).toContain('hover:bg-primary-mild');

    const plain = screen.getByRole('button', { name: 'Cancelar' });
    expect(plain.className).not.toContain('bg-primary');
    expect(plain.className).toContain('hover:text-primary-mild');

    const fallback = screen.getByRole('button', { name: 'Voltar' });
    expect(fallback.className).toContain('bg-white');
    expect(fallback.className).toContain('dark:bg-gray-700');
    expect(fallback.className).toContain('text-gray-600');
    expect(fallback.className).toContain('dark:text-gray-100');
    // Tamanho padrão (md do ConfigProvider): 48 px de altura.
    expect(fallback.className).toContain('h-12');
  });

  it('com ícone e texto, o ícone vem antes; só ícone usa a largura do controle', () => {
    render(
      <>
        <Button icon={<svg data-icon="" aria-hidden />}>Novo</Button>
        <Button icon={<svg aria-hidden />} aria-label="Fechar" />
      </>,
    );

    const withText = screen.getByRole('button', { name: 'Novo' });
    const [icon, text] = [...(withText.firstElementChild?.children ?? [])];
    expect(icon?.querySelector('[data-icon]')).toBeTruthy();
    expect(text?.textContent).toBe('Novo');
    const iconOnly = screen.getByRole('button', { name: 'Fechar' });
    expect(iconOnly.className).toContain('w-12');
  });

  it('disabled: atributo nativo, sem clique e sem a resposta ao clique', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Publicar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Publicar' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.className).toContain('opacity-50');
    expect(button.className).not.toContain('button-press-feedback');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled em outro elemento (asElement) vira aria-disabled', () => {
    render(
      <Button asElement="a" href="/sites" disabled>
        Sites
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Sites' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('loading: aria-busy e aria-disabled, Spinner oculto, clique bloqueado e foco mantido', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enviar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Enviar' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button).toHaveProperty('disabled', false);
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');

    button.focus();
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('habilitado, aciona o onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
