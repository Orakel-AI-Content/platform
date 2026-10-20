// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import navigationConfig, {
  filterNavigation,
  NAV_ITEM_TYPE_ITEM,
  NAV_ITEM_TYPE_TITLE,
  type NavigationTree,
} from '@/configs/navigation.config';

import VerticalMenuContent from './VerticalMenuContent.tsx';

// Menu da barra (#237, #238), com `VerticalSingleMenuItem` e `VerticalMenuIcon`: o <nav> com o
// nome recebido, os grupos com o rótulo (some recolhido), os caminhos com o `siteId`, só o
// `activeKey` em aria-current, recolhido o título em `sr-only` e a dica, o link externo em
// outra aba, o ícone só até o primeiro nível de grupo e o clique avisado.

afterEach(cleanup);
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const TREE = filterNavigation(navigationConfig, { email: 'e', roles: ['editor'] });

const item = (key: string, title: string, extra: Partial<NavigationTree> = {}): NavigationTree => ({
  key,
  path: `/${key}`,
  title,
  icon: 'sites',
  type: NAV_ITEM_TYPE_ITEM,
  authority: [],
  subMenu: [],
  ...extra,
});

const group = (key: string, title: string, subMenu: NavigationTree[]): NavigationTree => ({
  ...item(key, title),
  path: '',
  type: NAV_ITEM_TYPE_TITLE,
  subMenu,
});

const nav = (name: string) => screen.getByRole('navigation', { name });
const currentLinks = (element: HTMLElement) =>
  within(element)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page');

describe('VerticalMenuContent', () => {
  it('o <nav> tem o nome recebido; o grupo é uma lista nomeada pelo rótulo', () => {
    render(<VerticalMenuContent aria-label="Áreas do site" navigationTree={TREE} siteId="a" />);

    const areas = nav('Áreas do site');
    expect(within(areas).getByRole('list', { name: 'Áreas do site' })).toBeTruthy();
    expect(within(areas).getByRole('link', { name: 'Sites' }).getAttribute('href')).toBe('/sites');
  });

  it('os caminhos das áreas levam o siteId; os globais ficam iguais', () => {
    render(
      <VerticalMenuContent aria-label="Áreas do site" navigationTree={TREE} siteId="exemplo b" />,
    );

    const links = within(nav('Áreas do site')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sites',
      '/sites/exemplo%20b',
      '/sites/exemplo%20b/conteudos',
      '/sites/exemplo%20b/revisao',
      '/sites/exemplo%20b/midia',
      '/sites/exemplo%20b/autores',
      '/sites/exemplo%20b/taxonomias',
      '/sites/exemplo%20b/menus',
      '/sites/exemplo%20b/institucionais',
    ]);
  });

  it('só o item do activeKey tem aria-current="page"; sem activeKey, nenhum', () => {
    const { rerender } = render(
      <VerticalMenuContent
        aria-label="Áreas do site"
        navigationTree={TREE}
        siteId="a"
        activeKey="site.media"
      />,
    );
    expect(currentLinks(nav('Áreas do site')).map((link) => link.textContent)).toEqual(['Mídia']);

    rerender(<VerticalMenuContent aria-label="Áreas do site" navigationTree={TREE} siteId="a" />);
    expect(currentLinks(nav('Áreas do site'))).toEqual([]);
  });

  it('expandido, o título aparece e o ícone é aria-hidden', () => {
    render(<VerticalMenuContent aria-label="Principal" navigationTree={TREE} />);

    const sites = within(nav('Principal')).getByRole('link', { name: 'Sites' });
    expect(sites.querySelector('.sr-only')).toBeNull();
    expect(sites.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('recolhido: sem o rótulo do grupo, o título em sr-only e a dica no foco', async () => {
    render(
      <VerticalMenuContent
        aria-label="Áreas do site"
        navigationTree={TREE}
        siteId="a"
        activeKey="site.authors"
        collapsed
      />,
    );

    const areas = nav('Áreas do site');
    expect(within(areas).queryByRole('list', { name: 'Áreas do site' })).toBeNull();
    const autores = within(areas).getByRole('link', { name: 'Autores' });
    expect(autores.getAttribute('aria-current')).toBe('page');
    expect(autores.querySelector('.sr-only')?.textContent).toBe('Autores');

    autores.focus();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Autores');
  });

  it('link externo abre em outra aba; o interno, não', () => {
    render(
      <VerticalMenuContent
        aria-label="Principal"
        navigationTree={[
          item('interno', 'Interno'),
          item('externo', 'Externo', { path: 'https://example.com', isExternalLink: true }),
        ]}
      />,
    );

    const principal = nav('Principal');
    expect(within(principal).getByRole('link', { name: 'Externo' }).getAttribute('target')).toBe(
      '_blank',
    );
    expect(within(principal).getByRole('link', { name: 'Interno' }).hasAttribute('target')).toBe(
      false,
    );
  });

  it('o ícone aparece até o primeiro nível de grupo, não abaixo dele', () => {
    render(
      <VerticalMenuContent
        aria-label="Principal"
        navigationTree={[
          group('g1', 'Grupo', [
            item('raso', 'Raso'),
            group('g2', 'Subgrupo', [item('fundo', 'Fundo')]),
          ]),
        ]}
      />,
    );

    const principal = nav('Principal');
    expect(within(principal).getByRole('link', { name: 'Raso' }).querySelector('svg')).toBeTruthy();
    expect(within(principal).getByRole('link', { name: 'Fundo' }).querySelector('svg')).toBeNull();
  });

  it('clicar num item chama onMenuItemClick', async () => {
    const user = userEvent.setup();
    const onMenuItemClick = vi.fn();
    render(
      <VerticalMenuContent
        aria-label="Áreas do site"
        navigationTree={TREE}
        siteId="a"
        onMenuItemClick={onMenuItemClick}
      />,
    );

    await user.click(within(nav('Áreas do site')).getByRole('link', { name: 'Mídia' }));
    expect(onMenuItemClick).toHaveBeenCalledOnce();
  });
});
