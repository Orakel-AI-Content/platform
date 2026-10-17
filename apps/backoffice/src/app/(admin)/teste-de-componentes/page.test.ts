import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vitrine de componentes (#205): desligada por padrão (404), só existe com a variável.

const env = vi.hoisted(() => ({ E2E_ERROR_ROUTE: false }));
vi.mock('@/env.ts', () => ({ getEnv: () => env }));

const { default: ComponentsShowcasePage } = await import('./page.tsx');

describe('página /teste-de-componentes', () => {
  beforeEach(() => {
    env.E2E_ERROR_ROUTE = false;
  });

  it('sem E2E_ERROR_ROUTE, não existe (notFound → 404)', () => {
    let thrown: unknown;
    try {
      ComponentsShowcasePage();
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { digest?: string } | undefined)?.digest).toMatch(/;404$/);
  });

  it('com E2E_ERROR_ROUTE, renderiza a vitrine', () => {
    env.E2E_ERROR_ROUTE = true;
    expect(ComponentsShowcasePage()).toBeTruthy();
  });
});
