// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ButtonLink from './ButtonLink.tsx';

// ButtonLink (#247): o link do Next com o visual do Button, para as páginas do servidor.

afterEach(cleanup);

describe('ButtonLink', () => {
  it('renderiza um link com o href e as variantes do Button', () => {
    render(
      <ButtonLink href="/sites/novo" variant="solid" size="sm">
        Criar site
      </ButtonLink>,
    );

    const link = screen.getByRole('link', { name: 'Criar site' });
    expect(link.getAttribute('href')).toBe('/sites/novo');
    expect(link.className).toContain('bg-primary');
  });
});
