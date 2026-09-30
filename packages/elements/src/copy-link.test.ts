import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CopyEventDetail } from './copy-link.ts';
import { flush, mount } from './test-dom.ts';

const HTML = `
  <ok-copy-link data-copied="Link copiado" data-failed="Selecione e copie o link">
    <label>Link <input data-ok-url readonly value="https://exemplo-a.com.br/guia/"></label>
    <button type="button" data-ok-copy hidden>Copiar link</button>
    <span data-ok-status role="status"></span>
  </ok-copy-link>`;

const button = () => document.querySelector<HTMLButtonElement>('[data-ok-copy]')!;
const status = () => document.querySelector('[data-ok-status]')!.textContent;

afterEach(() => vi.unstubAllGlobals());

describe('<ok-copy-link>', () => {
  it('copia o link, anuncia e emite ok-copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await mount(HTML);
    const events: CopyEventDetail[] = [];
    document.addEventListener('ok-copy', (event) =>
      events.push((event as CustomEvent<CopyEventDetail>).detail),
    );

    expect(button().hidden).toBe(false);
    button().click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('https://exemplo-a.com.br/guia/');
    expect(status()).toBe('Link copiado');
    expect(events).toEqual([{ url: 'https://exemplo-a.com.br/guia/' }]);
  });

  it('sem clipboard (ou com erro), seleciona o campo e explica', async () => {
    vi.stubGlobal('navigator', {});
    await mount(HTML);
    const field = document.querySelector<HTMLInputElement>('[data-ok-url]')!;
    const select = vi.spyOn(field, 'select');
    button().click();
    await flush();
    expect(select).toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(status()).toBe('Selecione e copie o link');
  });

  it('sem o campo, o botão continua oculto', async () => {
    await mount('<ok-copy-link><button data-ok-copy hidden></button></ok-copy-link>');
    expect(button().hidden).toBe(true);
  });
});
