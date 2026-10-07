import { beforeEach, describe, expect, it, vi } from 'vitest';

// Gatilho do E2E da tela de erro (#77): desligado por padrão (404), só lança com a variável.

const env = vi.hoisted(() => ({ E2E_ERROR_ROUTE: false }));
vi.mock('@/env.ts', () => ({ getEnv: () => env }));

const { default: ErrorTriggerPage } = await import('./page.tsx');

describe('página /teste-de-erro', () => {
  beforeEach(() => {
    env.E2E_ERROR_ROUTE = false;
  });

  it('sem E2E_ERROR_ROUTE, não existe (notFound → 404)', () => {
    let thrown: unknown;
    try {
      ErrorTriggerPage();
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { digest?: string } | undefined)?.digest).toMatch(/;404$/);
  });

  it('com E2E_ERROR_ROUTE, lança a exceção que a tela de erro mostra', () => {
    env.E2E_ERROR_ROUTE = true;
    expect(() => ErrorTriggerPage()).toThrow('Erro provocado pelo E2E da tela de erro.');
  });
});
