import { expect, test, type Locator, type Page } from '@playwright/test';

// Título do item na aba (#79, workspace#32) contra o ambiente local semeado: editor, versões,
// uma versão e as edições de autor, taxonomia e menu; item inexistente fica só com a área.

const EDITOR = 'editor@orakel.local';
const SITE = 'exemplo-a';
const SUFFIX = 'Exemplo A — Guias · Orakel Backoffice';

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/sites');
  await page.getByRole('link', { name: email }).click();
  await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
}

/** Nome acessível de um link, sem o prefixo ou sufixo que só serve ao leitor de tela. */
async function linkName(link: Locator, strip: RegExp): Promise<string> {
  return ((await link.textContent()) ?? '').replace(strip, '').trim();
}

test('editor, versões e uma versão mostram o título do conteúdo', async ({ page }) => {
  await loginAs(page, EDITOR);
  await page.goto(`/sites/${SITE}/conteudos`);
  const first = page
    .getByRole('table')
    .getByRole('link', { name: / \(versões\)$/ })
    .first();
  const title = await linkName(first, / \(versões\)$/);
  await first.click();
  await expect(page).toHaveTitle(`${title} · Versões · ${SUFFIX}`);
  const versions = page.url();

  await page.goto(`${versions}/editar`);
  await expect(page).toHaveTitle(`${title} · Editar conteúdo · ${SUFFIX}`);

  // A versão 1 pode ter outro título se o conteúdo já foi editado: vale o do cabeçalho.
  await page.goto(`${versions}/versoes/1`);
  const heading = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';
  const versionTitle = /“(.+)”/.exec(heading)?.[1];
  expect(versionTitle).toBeTruthy();
  await expect(page).toHaveTitle(`${versionTitle} · Versão 1 · ${SUFFIX}`);
});

test('a edição de autor, taxonomia e menu mostra o nome (ou a chave) do item', async ({ page }) => {
  await loginAs(page, EDITOR);
  for (const [area, label] of [
    ['autores', 'Editar autor'],
    ['taxonomias', 'Editar taxonomia'],
    ['menus', 'Editar menu'],
  ]) {
    await page.goto(`/sites/${SITE}/${area}`);
    const edit = page
      .getByRole('table')
      .getByRole('link', { name: /^Editar / })
      .first();
    const name = await linkName(edit, /^Editar\s*/);
    await edit.click();
    await expect(page).toHaveTitle(`${name} · ${label} · ${SUFFIX}`);
  }
});

test('item inexistente responde 404 e a aba fica só com a área', async ({ page }) => {
  await loginAs(page, EDITOR);

  const content = await page.goto(`/sites/${SITE}/conteudos/999999/editar`);
  expect(content?.status()).toBe(404);
  await expect(page).toHaveTitle(`Editar conteúdo · ${SUFFIX}`);

  const author = await page.goto(`/sites/${SITE}/autores/999999`);
  expect(author?.status()).toBe(404);
  await expect(page).toHaveTitle(`Editar autor · ${SUFFIX}`);
});
