import { afterEach, describe, expect, it, vi } from 'vitest';

import { flush, mount } from './test-dom.ts';

const HTML = `
  <ok-share data-title="Guia" data-url="https://exemplo-a.com.br/guia/">
    <button type="button" data-ok-share hidden>Compartilhar</button>
  </ok-share>`;

const button = () => document.querySelector<HTMLButtonElement>('[data-ok-share]')!;

afterEach(() => vi.unstubAllGlobals());

describe('<ok-share>', () => {
  it('sem Web Share, o botão continua oculto', async () => {
    vi.stubGlobal('navigator', {});
    await mount(HTML);
    expect(button().hidden).toBe(true);
  });

  it('com Web Share, abre o compartilhamento com título e URL; cancelar não é erro', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError'));
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await mount(HTML);
    expect(button().hidden).toBe(false);
    button().click();
    await flush();
    expect(share).toHaveBeenCalledWith({ title: 'Guia', url: 'https://exemplo-a.com.br/guia/' });
  });

  it('respeita canShare', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
    await mount(HTML);
    expect(button().hidden).toBe(true);
  });
});
