import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import type { SiteSummary } from '@/domain/sites/sites.ts';

import { followLinks, navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { SitesTable } from './SitesTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Lista de sites legível de relance em Chromium (#460; antes no E2E, `sites-list.spec.ts`, #100,
// #153, #248): com 20 sites numa janela de 1280 px, na moldura do admin (barra de 290 px), nem a
// página nem a tabela rolam na horizontal e nenhuma célula passa de duas linhas de texto. O pior
// caso de largura fica nos dados: nome e domínio longos, um site pausado com motivo longo e conteúdo culpado e um
// com último build e versão longa. As ações são as da operação (publicar e configurar). O menu
// "Mais ações" (#248; antes no E2E, #476) abre pelo mouse e pelo teclado, com o foco no primeiro
// item e as setas nos outros, e acionar um item fecha o menu e navega. "Publicar agora" é o
// último item do menu (#586), não um botão na linha.

const STAMP = '1761000000000';
const LONG_NAME = 'Guia completo de receitas regionais brasileiras para o dia a dia';
const LONG_FAILURE = 'Tema "padrao-editorial-receitas" não existe nesta release do site-builder';
const LONG_VERSION = '3f9c2a7e-5b1d-4c8e-9a6f-0d2e4b7c1a95';

const ids = Array.from({ length: 20 }, (_, index) => `e2e-lista-${STAMP}-${index + 1}`);

const SITES: SiteSummary[] = ids.map((id, index) => ({
  id,
  name: index === 0 ? LONG_NAME : `Site ${id}`,
  domain: index === 0 ? `receitas-regionais-brasileiras.${id}.example.com` : `${id}.example.com`,
  lifecycle: 'cadastrado',
  state: index === 1 ? 'pausado' : 'ativo',
  pausedReason: index === 1 ? `render: ${LONG_FAILURE}` : null,
  pausedCulprit: index === 1 ? { origin: 'content', reference: '12345' } : null,
  activeVersionId: null,
  release: null,
  indexavel: false,
  pendingChanges: 1,
  lastBuild:
    index === 2
      ? { status: 'ok', versionId: LONG_VERSION, finishedAt: new Date('2026-10-20T12:00Z') }
      : index === 1
        ? { status: 'failed', versionId: null, finishedAt: new Date('2026-10-20T12:00Z') }
        : null,
  buildWindowSeconds: null,
  effectiveBuildWindowSeconds: 300,
  dailyPublishLimit: null,
  effectiveDailyPublishLimit: 10,
  publishedToday: 0,
  timeZone: index % 2 === 0 ? 'America/Sao_Paulo' : 'Europe/Lisbon',
}));

const publishNow = () => Promise.resolve({ ok: true as const, message: 'ok' });

function Sites() {
  return (
    <ListScreen title="Sites">
      <SitesTable rows={SITES} publishNow={publishNow} canConfigure labelledBy="lista-titulo" />
    </ListScreen>
  );
}

let unfollow: () => void;

beforeEach(() => {
  // Todos numa página só (o padrão é 25, mas a pessoa pode ter escolhido menos).
  navigation.set('/sites?por-pagina=100');
  unfollow = followLinks();
});

afterEach(() => {
  unfollow();
  navigation.set('/');
});

const moreActions = () => page.getByRole('button', { name: `Mais ações: ${ids[0]}` });
const menu = () => page.getByRole('menu');
const menuItem = (name: string) => menu().getByRole('menuitem', { name: `${name} ${ids[0]}` });

describe('SitesTable no navegador', () => {
  it('o menu Mais ações abre e fecha pelo mouse e pelo teclado; Esc devolve o foco', async () => {
    await renderInFrame(<Sites />, { roles: ['admin'] });

    // Mouse: abre no clique e fecha no clique fora.
    await moreActions().click();
    await expect.element(menuItem('Editar configuração')).toBeVisible();
    await page.getByRole('heading', { name: 'Sites' }).click();
    await expect.element(menu()).not.toBeInTheDocument();

    // Teclado: Enter abre com o foco no primeiro item; as setas percorrem; Esc fecha e devolve o
    // foco ao botão.
    (moreActions().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(menuItem('Conteúdos')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(menuItem('Mídia')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(menuItem('Editar configuração')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect.element(menu()).not.toBeInTheDocument();
    await expect.element(moreActions()).toHaveFocus();

    // Espaço e seta para baixo no botão também abrem.
    for (const key of [' ', '{ArrowDown}']) {
      await userEvent.keyboard(key);
      await expect.element(menuItem('Conteúdos')).toHaveFocus();
      await userEvent.keyboard('{Escape}');
      await expect.element(menu()).not.toBeInTheDocument();
      await expect.element(moreActions()).toHaveFocus();
    }
  });

  it('acionar um item do menu Mais ações fecha o menu e navega, pelo teclado e pelo mouse', async () => {
    await renderInFrame(<Sites />, { roles: ['admin'] });

    (moreActions().element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(menuItem('Conteúdos')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(menuItem('Mídia')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(navigation.get()).toBe(`/sites/${ids[0]}/midia`);
    await expect.element(menu()).not.toBeInTheDocument();

    navigation.set('/sites?por-pagina=100');
    await moreActions().click();
    await menuItem('Conteúdos').click();
    expect(navigation.get()).toBe(`/sites/${ids[0]}/conteudos`);
    await expect.element(menu()).not.toBeInTheDocument();
  });
});
