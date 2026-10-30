import type { ReactNode } from 'react';
import { render } from 'vitest-browser-react';

import { ModalAppElement } from '@/components/ui/ModalAppElement';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

// Render dos testes de componente (#457) com o que o layout raiz dá a toda tela: o
// `MotionConfig` que respeita o movimento reduzido.
export function renderUi(ui: ReactNode) {
  return render(ui, { wrapper: MotionProvider });
}

/**
 * Render com o corpo do layout raiz (`src/app/layout.tsx`, #458): o componente dentro do
 * contêiner da app, que o react-modal recebe como `appElement` e que fica `inert` com diálogo
 * aberto, e a região viva dos toasts fora dele. Para Dialog, Drawer, ConfirmDialog e toast.
 */
export function renderInApp(ui: ReactNode) {
  return render(
    <MotionProvider>
      <ModalAppElement />
      <div id={APP_ELEMENT_ID}>{ui}</div>
      <ToastProvider />
    </MotionProvider>,
  );
}
