import { expect, type Locator } from '@playwright/test';

// Select do Ecme (react-select, #330) no E2E, só com teclado: foco no combobox, digitar filtra a
// lista e Enter escolhe a opção em foco. O `combobox` é o que o rótulo do `FormItem` nomeia.
export async function chooseOption(combobox: Locator, option: string): Promise<void> {
  await combobox.focus();
  await combobox.pressSequentially(option);
  await expect(combobox.page().getByRole('option', { name: option, exact: true })).toBeVisible();
  await combobox.press('Enter');
}
