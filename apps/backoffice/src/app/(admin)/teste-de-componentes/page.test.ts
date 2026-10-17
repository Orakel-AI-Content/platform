import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vitrine de componentes (#205): desligada por padrão (404), só existe com a variável. A
// página da Pagination em modo link vem de `?pagina-link=` (#214, #215).

const env = vi.hoisted(() => ({ E2E_ERROR_ROUTE: false }));
vi.mock('@/env.ts', () => ({ getEnv: () => env }));

const { default: ComponentsShowcasePage } = await import('./page.tsx');

const render = (pagina?: string | string[]) =>
  ComponentsShowcasePage({ searchParams: Promise.resolve({ 'pagina-link': pagina }) });

/** `linkPage` que a página passa à vitrine (segundo filho do contêiner). */
async function linkPage(pagina?: string | string[]): Promise<unknown> {
  const page = (await render(pagina)) as ReactElement<{ children: ReactElement[] }>;
  return (page.props.children[1] as ReactElement<{ linkPage: number }>).props.linkPage;
}

describe('página /teste-de-componentes', () => {
  beforeEach(() => {
    env.E2E_ERROR_ROUTE = false;
  });

  it('sem E2E_ERROR_ROUTE, não existe (notFound → 404)', async () => {
    const thrown: unknown = await render().catch((error: unknown) => error);
    expect((thrown as { digest?: string } | undefined)?.digest).toMatch(/;404$/);
  });

  it('com E2E_ERROR_ROUTE, renderiza a vitrine', async () => {
    env.E2E_ERROR_ROUTE = true;
    expect(await render()).toBeTruthy();
  });

  it('passa a página de ?pagina-link= à vitrine; sem número válido, a 1', async () => {
    env.E2E_ERROR_ROUTE = true;
    expect(await linkPage('3')).toBe(3);
    expect(await linkPage()).toBe(1);
    expect(await linkPage('x')).toBe(1);
    expect(await linkPage(['2', '4'])).toBe(1);
  });
});
