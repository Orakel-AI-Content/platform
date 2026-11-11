import type { Page } from '@playwright/test';

/** Acrescenta um bloco do tipo no fim, pelo "+" do fim da lista do editor (#591). */
export async function addBlock(page: Page, type: string): Promise<void> {
  await page
    .getByRole('button', { name: /^Inserir bloco na posição/ })
    .last()
    .click();
  await page.getByRole('menuitem', { name: type, exact: true }).click();
}
