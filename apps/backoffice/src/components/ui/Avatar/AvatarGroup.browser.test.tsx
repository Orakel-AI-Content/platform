import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { renderUi } from '../../../../test/browser/render.tsx';
import { Avatar } from './index.tsx';

// Avatar.Group em Chromium (#458; da vitrine, #211): com `maxCount`, os omitidos viram um avatar
// "+N" cuja dica, no hover, diz quantos são.

describe('Avatar.Group no navegador', () => {
  it('mostra "+N" e a dica "N a mais" no avatar omitido', async () => {
    const screen = await renderUi(
      <div className="p-12">
        <Avatar.Group chained maxCount={3} omittedAvatarTooltip>
          <Avatar>AS</Avatar>
          <Avatar>MR</Avatar>
          <Avatar>JP</Avatar>
          <Avatar>LC</Avatar>
          <Avatar>TF</Avatar>
        </Avatar.Group>
      </div>,
    );
    const avatars = [...screen.container.querySelectorAll('.avatar-group .avatar')];

    expect(avatars.map((avatar) => avatar.textContent)).toEqual(['AS', 'MR', 'JP', '+2']);
    const omitted = avatars.at(-1)!;
    await userEvent.hover(omitted);
    const tooltip = page.getByRole('tooltip');
    await expect.element(tooltip).toHaveTextContent('2 a mais');
    expect(omitted.getAttribute('aria-describedby')).toBe(tooltip.element().id);
  });
});
