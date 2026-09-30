import { describe, expect, it } from 'vitest';

import { define } from './define.ts';
import { ELEMENT_TAGS, OkElement } from './index.ts';
import './test-dom.ts';

describe('define', () => {
  it('registra os quatro elementos pelos subcaminhos', () => {
    for (const tag of ELEMENT_TAGS) expect(customElements.get(tag)).toBeDefined();
  });

  it('ignora a mesma tag registrada de novo', () => {
    class Outro extends OkElement {
      protected setup(): void {}
    }
    expect(() => define('ok-carousel', Outro)).not.toThrow();
    expect(customElements.get('ok-carousel')).not.toBe(Outro);
  });

  it('reconectar liga o comportamento de novo', async () => {
    let setups = 0;
    class Contador extends OkElement {
      protected setup(): void {
        setups += 1;
      }
    }
    define('ok-contador-teste', Contador);
    const element = document.createElement('ok-contador-teste');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    element.remove();
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setups).toBe(2);
  });
});
