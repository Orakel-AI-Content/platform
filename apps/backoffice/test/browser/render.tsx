import type { ReactNode } from 'react';
import { render } from 'vitest-browser-react';

import { MotionProvider } from '@/components/ui/MotionProvider';

// Render dos testes de componente (#457) com o que o layout raiz dá a toda tela: o
// `MotionConfig` que respeita o movimento reduzido.
export function renderUi(ui: ReactNode) {
  return render(ui, { wrapper: MotionProvider });
}
