import { describe, expect, it } from 'vitest';

import { audit, COLOR_SCHEMES, setTheme } from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Timeline } from './index.tsx';

// Timeline em Chromium (#646): a lista com o marcador padrão e com `media` sem violação do axe
// nos dois temas.

function Historico() {
  return (
    <section aria-label="Timeline">
      <Timeline>
        <Timeline.Item>
          <p className="heading-text font-semibold">Publicação concluída</p>
          <p>ana · 14:02</p>
        </Timeline.Item>
        <Timeline.Item media={<span className="block h-4 w-4 rounded-full bg-primary" />}>
          <p className="heading-text font-semibold">Reversão para a v40</p>
          <p>bruno · 13:10</p>
        </Timeline.Item>
        <Timeline.Item>
          <p className="heading-text font-semibold">Publicação com falha</p>
          <p>ana · 12:45</p>
        </Timeline.Item>
      </Timeline>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('Timeline no navegador (%s)', (scheme) => {
  it('sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Historico />);

    await expect.element(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('listitem').elements()).toHaveLength(3);
    expect(await audit()).toEqual([]);
  });
});
