// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '../Button/index.tsx';
import { Input } from '../Input/index.tsx';
import { InputGroup } from './index.tsx';

// InputGroup do Ecme (#207): complementos antes e depois do campo, com o tamanho do grupo
// passado ao Input, ao Addon e ao Button.

afterEach(cleanup);

describe('InputGroup', () => {
  it('prefixo e sufixo como Addon, na ordem, com o tamanho do grupo', () => {
    render(
      <InputGroup size="sm" className="max-w-md">
        <InputGroup.Addon>https://</InputGroup.Addon>
        <Input aria-label="Domínio" />
        <InputGroup.Addon>.com.br</InputGroup.Addon>
      </InputGroup>,
    );

    const input = screen.getByRole('textbox', { name: 'Domínio' });
    const group = input.parentElement!;
    expect(group.className).toContain('input-group');
    expect(group.className).toContain('max-w-md');
    expect([...group.children].map((child) => child.textContent)).toEqual([
      'https://',
      '',
      '.com.br',
    ]);
    expect(input.className).toContain('h-10');

    const addon = screen.getByText('https://');
    expect(addon.className).toContain('input-addon');
    expect(addon.className).toContain('input-addon-sm');
    expect(addon.className).toContain('h-10');
    expect(addon.className).toContain('text-gray-600');
    expect(addon.className).toContain('dark:text-gray-100');
  });

  it('o Button no grupo usa o tamanho do grupo', () => {
    render(
      <InputGroup size="lg">
        <Input aria-label="Busca" />
        <Button>Buscar</Button>
      </InputGroup>,
    );

    expect(screen.getByRole('button', { name: 'Buscar' }).className).toContain('h-14');
    expect(screen.getByRole('textbox', { name: 'Busca' }).className).toContain('input-lg');
  });

  it('o size do Addon vence o do grupo', () => {
    render(
      <InputGroup size="lg">
        <InputGroup.Addon size="sm">@</InputGroup.Addon>
      </InputGroup>,
    );

    expect(screen.getByText('@').className).toContain('input-addon-sm');
  });
});
