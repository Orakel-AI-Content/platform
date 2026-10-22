import { motion } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { REDUCED_MOTIONS, setReducedMotion } from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';

// MotionProvider em Chromium (#457; da vitrine, #205): com movimento reduzido, o `MotionConfig`
// do layout desliga as animações de transform do `motion`; sem preferência, elas rodam.

describe('MotionProvider no navegador', () => {
  it.each(REDUCED_MOTIONS)('com reducedMotion %s', async (reducedMotion) => {
    await setReducedMotion(reducedMotion);
    const screen = await renderUi(
      <motion.div initial={{ x: -120 }} animate={{ x: 0 }} transition={{ duration: 3 }}>
        Painel animado
      </motion.div>,
    );
    const panel = screen.getByText('Painel animado');
    await expect.element(panel).toBeVisible();
    // Um quadro depois: a animação de 3 s ainda estaria no meio do caminho.
    await new Promise(requestAnimationFrame);

    const offset = new DOMMatrix(getComputedStyle(panel.element()).transform).m41;
    if (reducedMotion === 'reduce') expect(offset).toBe(0);
    else expect(offset).toBeLessThan(0);
  });
});
