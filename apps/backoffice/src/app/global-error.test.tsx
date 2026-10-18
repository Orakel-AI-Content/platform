import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { THEME_COOKIE_SCRIPT } from '@/configs/theme.config';

import GlobalError from './global-error.tsx';

// global-error (#77): documento próprio em pt-BR, cabeçalho estático do Backoffice e a tela de
// erro, sem a mensagem da exceção; o tema escolhido vem do script do <head> (#283). O clique em
// "Tentar de novo" é coberto no error.test.tsx.

describe('global-error', () => {
  const failure = Object.assign(new Error('conexão recusada: segredo'), { digest: '42' });
  const html = renderToStaticMarkup(<GlobalError error={failure} retry={() => undefined} />);

  it('traz o próprio documento em pt-BR com o título da aba', () => {
    expect(html).toMatch(/^<html lang="pt-BR">/);
    expect(html).toContain('<title>Erro · Orakel Backoffice</title>');
  });

  it('aplica o tema no <head>, pelo cookie e, sem ele, pela preferência do sistema', () => {
    const head = /<head>(.*)<\/head>/.exec(html)?.[1] ?? '';
    expect(head).toContain(`<script>${THEME_COOKIE_SCRIPT}</script>`);
    expect(THEME_COOKIE_SCRIPT).toContain('document.cookie');
    expect(THEME_COOKIE_SCRIPT).toContain('orakel-theme=');
    expect(THEME_COOKIE_SCRIPT).toContain("matchMedia('(prefers-color-scheme: dark)')");
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
