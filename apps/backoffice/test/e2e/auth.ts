import { expect, test, type Page } from '@playwright/test';

import { TEST_USERS } from '../../src/bin/seed.ts';

// Sessão de um usuário de teste sem passar pelo login do access-mock (#474): o JWT vem da rota
// de token do mock (só de teste, ADR 0004) e vai para o contexto inteiro, no header que o app
// lê e no cookie que o forward_auth do Caddy confere. Assim o mesmo spec roda na camada
// `telas` (sem Caddy, pelo header) e contra a pilha (pelo cookie).

export type TestRole = (typeof TEST_USERS)[number]['roles'][number];

const COOKIE = 'CF_Authorization';

/** E-mail do usuário de teste do papel (um por papel, os mesmos do access-mock). */
function emailFor(role: TestRole): string {
  const user = TEST_USERS.find((candidate) =>
    (candidate.roles as readonly string[]).includes(role),
  );
  if (user === undefined) throw new Error(`Sem usuário de teste com o papel ${role}`);
  return user.email;
}

/** Entra como o usuário do papel e abre /sites, como o login pelo access-mock fazia. */
export async function asRole(page: Page, role: TestRole): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? 'https://admin.orakel.localhost';
  // Na camada `telas`, o mock tem porta própria (playwright.config.ts); na pilha, o Caddy
  // repassa /cdn-cgi/access/* do próprio host para ele.
  const accessURL = process.env.E2E_ACCESS_URL ?? baseURL;
  const response = await page.request.get(`${accessURL}/cdn-cgi/access/token`, {
    params: { email: emailFor(role) },
  });
  expect(response.status(), 'rota de token do access-mock').toBe(200);
  const token = await response.text();

  const context = page.context();
  await context.setExtraHTTPHeaders({ 'cf-access-jwt-assertion': token });
  await context.addCookies([{ name: COOKIE, value: token, url: baseURL }]);
  await page.goto('/sites');
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}
