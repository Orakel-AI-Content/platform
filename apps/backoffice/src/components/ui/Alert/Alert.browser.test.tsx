import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Alert } from './index.tsx';

// Alert em Chromium (#458; da vitrine, #212): os quatro tipos sem violação do axe nos dois
// temas, e o closable fecha pelo teclado, com contorno de 2px no Fechar.

function Alerts() {
  return (
    <section aria-label="Alert" className="space-y-3">
      <Alert type="info" showIcon duration={0}>
        A revisão do artigo começa amanhã.
      </Alert>
      <Alert type="success" showIcon duration={0} title="Artigo publicado">
        Ele já aparece no site.
      </Alert>
      <Alert type="warning" showIcon duration={0}>
        O site tem alterações pendentes de publicação.
      </Alert>
      <Alert type="danger" showIcon duration={0}>
        A última publicação falhou.
      </Alert>
      <Alert type="info" closable duration={0}>
        Aviso que pode ser fechado.
      </Alert>
    </section>
  );
}

describe('Alert no navegador', () => {
  it('closable: Fechar com contorno de 2px e pelo teclado', async () => {
    const screen = await renderUi(<Alerts />);
    const close = screen.getByRole('button', { name: 'Fechar' });

    await tabTo(close);
    expect(outline(close)).toEqual(focusRing());

    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByText('Aviso que pode ser fechado.')).not.toBeInTheDocument();
  });
});

describe.each(COLOR_SCHEMES)('Alert no navegador (%s)', (scheme) => {
  it('nos quatro tipos, sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Alerts />);

    expect(screen.container.querySelectorAll('.alert')).toHaveLength(5);
    expect(await audit()).toEqual([]);
  });
});
