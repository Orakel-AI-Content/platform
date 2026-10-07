// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/domain/access/rbac.ts';

import { backToSite, backToSites, ForbiddenScreen, forbiddenReason } from './forbidden-screen.tsx';

// Tela de permissão (#80): título, motivo com os papéis da matriz do RBAC e saída.

afterEach(cleanup);

describe('tela de permissão', () => {
  it('um revisor em "criar conteúdo" vê o título, o motivo e o link para o site', () => {
    render(<ForbiddenScreen action="content.write" back={backToSite('exemplo-a')} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sem permissão' })).toBeTruthy();
    expect(screen.getByText('Editar conteúdo exige o papel admin ou editor.')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ir para o site exemplo-a' }).getAttribute('href'),
    ).toBe('/sites/exemplo-a');
  });

  it('sem site para voltar, leva à lista de sites', () => {
    render(<ForbiddenScreen action="site.configure" back={backToSites} />);
    expect(screen.getByText('Configurar os sites exige o papel admin ou operacao.')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ir para a lista de sites' }).getAttribute('href'),
    ).toBe('/sites');
  });

  it('lista todos os papéis da matriz que permitem a ação', () => {
    expect(forbiddenReason('site.read')).toBe(
      'Ver os sites exige o papel admin, editor, revisor ou operacao.',
    );
  });

  it('os papéis vêm da matriz: mudá-la muda o texto', () => {
    const matrix = { ...PERMISSIONS, revisor: [...PERMISSIONS.revisor, 'content.write' as const] };
    expect(forbiddenReason('content.write', matrix)).toBe(
      'Editar conteúdo exige o papel admin, editor ou revisor.',
    );
    expect(forbiddenReason('content.write', { ...PERMISSIONS, editor: [] })).toBe(
      'Editar conteúdo exige o papel admin.',
    );
  });
});
