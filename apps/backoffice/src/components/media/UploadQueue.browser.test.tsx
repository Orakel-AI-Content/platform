import { describe, expect, it } from 'vitest';

import { MediaShowcase } from '@/app/(admin)/teste-de-componentes/media-showcase.tsx';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderUi } from '../../../test/browser/render.tsx';

// Fila de envio em Chromium (#459; da vitrine, #389): um estado por arquivo em texto, a barra de
// progresso só no envio e um anúncio só. A fixture é a seção da própria vitrine, com uma
// entrada em cada estado.

describe.each(COLOR_SCHEMES)('fila de envio no navegador (%s)', (scheme) => {
  it('um estado por arquivo, barra só no envio, um anúncio e sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderUi(<MediaShowcase />);
    const queue = screen.getByRole('region', { name: 'Fila de envio' });

    const status = queue.getByRole('status');
    expect(status.elements()).toHaveLength(1);
    await expect
      .element(status)
      .toHaveTextContent(
        'Só as 20 primeiras imagens foram enviadas; envie as outras em seguida. 6 envios: 1 aguardando, 1 enviando, 1 processando, 1 pronta, 1 recusada, 1 ainda processando',
      );
    const items = queue.getByRole('list', { name: 'Envios' }).getByRole('listitem');
    expect(items.elements()).toHaveLength(6);
    expect(items.nth(4).element().textContent).toContain('recusada: formato não aceito');
    expect(items.nth(5).element().textContent).toContain(
      'ainda processando; recarregue a página mais tarde',
    );

    const bar = queue.getByRole('progressbar');
    expect(bar.elements()).toHaveLength(1);
    await expect.element(bar).toHaveAccessibleName('Envio de galeria-01.png');
    await expect.element(bar).toHaveAttribute('aria-valuenow', '42');

    expect(await audit(queue)).toEqual([]);
  });
});
