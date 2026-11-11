// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CONTROL_SIZES } from '@/components/ui/utils/constants';

import { ContentViewLinks } from './ContentViewLinks.tsx';

// "Ver prévia" e "Ver no site" do detalhe do conteúdo (#597): em nova aba, com o aviso para
// leitor de tela, e "Ver no site" só com o endereço público.

afterEach(cleanup);

const PREVIEW = 'https://preview.orakel.local/horta-em-casa/guia/';
const PUBLIC = 'https://hortaemcasa.com.br/guia/';

describe('links de ver o conteúdo', () => {
  it('abre a prévia em nova aba, sem "Ver no site" fora do ar', () => {
    render(<ContentViewLinks previewUrl={PREVIEW} />);

    const preview = screen.getByRole('link', { name: 'Ver prévia (abre em nova aba)' });
    expect(preview.getAttribute('href')).toBe(PREVIEW);
    expect(preview.getAttribute('target')).toBe('_blank');
    expect(preview.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('link', { name: /Ver no site/ })).toBeNull();
  });

  it('no ar, abre o endereço público em nova aba', () => {
    render(<ContentViewLinks previewUrl={PREVIEW} publicUrl={PUBLIC} />);

    const live = screen.getByRole('link', { name: 'Ver no site (abre em nova aba)' });
    expect(live.getAttribute('href')).toBe(PUBLIC);
    expect(live.getAttribute('target')).toBe('_blank');
    expect(live.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('as duas em `size="sm"`, como as outras ações de cabeçalho', () => {
    render(<ContentViewLinks previewUrl={PREVIEW} publicUrl={PUBLIC} />);

    for (const link of screen.getAllByRole('link')) {
      expect(link.className.split(' ')).toContain(CONTROL_SIZES.sm.h);
    }
  });
});
