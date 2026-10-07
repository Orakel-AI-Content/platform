import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import GlobalError from './global-error.tsx';

// global-error (#77): documento próprio em pt-BR, cabeçalho estático do Backoffice e a tela de
// erro, sem a mensagem da exceção. O clique em "Tentar de novo" é coberto no error.test.tsx.

describe('global-error', () => {
  const failure = Object.assign(new Error('conexão recusada: segredo'), { digest: '42' });
  const html = renderToStaticMarkup(<GlobalError error={failure} retry={() => undefined} />);

  it('traz o próprio documento em pt-BR com o título da aba', () => {
    expect(html).toMatch(/^<html lang="pt-BR">/);
    expect(html).toContain('<title>Erro · Orakel Backoffice</title>');
  });

  it('mostra o cabeçalho do Backoffice e a tela de erro com o código', () => {
    expect(html).toMatch(/<header[^>]*>.*Orakel Backoffice.*<\/header>/);
    expect(html).toContain('Algo deu errado');
    expect(html).toContain('Tentar de novo');
    expect(html).toContain('Código do erro: 42');
  });

  it('não expõe a mensagem da exceção', () => {
    expect(html).not.toContain('segredo');
  });
});
