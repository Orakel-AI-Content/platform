import type { ReactNode } from 'react';
import { render } from 'vitest-browser-react';

import CollapsibleSide from '@/components/layouts/CollapsibleSide';
import AdaptiveCard from '@/components/shared/AdaptiveCard';
import { ListHeader } from '@/components/shared/PageHeader';
import { PAGE_CONTAINER_GUTTER_X, PAGE_CONTAINER_GUTTER_Y } from '@/components/template/constants';
import type { SwitcherSite } from '@/components/template/SiteSwitcher';
import { ModalAppElement } from '@/components/ui/ModalAppElement';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import classNames from '@/components/ui/utils/classNames';
import navigationConfig, { filterNavigation } from '@/configs/navigation.config';
import type { Role } from '@/db/schema/index.ts';

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

/** Sites da moldura: o atual vem do endereço (`navigation.set('/sites/<id>/…')`). */
export const FRAME_SITES: readonly SwitcherSite[] = [
  { id: 'exemplo-a', name: 'Exemplo A — Guias' },
  { id: 'exemplo-b', name: 'Exemplo B — Receitas' },
];

type FrameOptions = { sites?: readonly SwitcherSite[]; roles?: readonly Role[] };

/**
 * Render na moldura do admin (`src/app/(admin)/layout.tsx`, #460): a barra lateral do Ecme
 * (290 px), o header e o <main> com os gutters da página, como `renderInApp`. A largura útil é
 * a da tela de verdade, e as medidas de layout (linhas por célula, rolagem) valem para ela. Quem
 * usa precisa do roteador em memória (`vi.mock('next/navigation', …)`).
 */
export function renderInFrame(
  ui: ReactNode,
  { sites = FRAME_SITES, roles = ['editor'] }: FrameOptions = {},
) {
  return renderInApp(
    <div className="min-h-screen">
      <CollapsibleSide
        navigationTree={filterNavigation(navigationConfig, { email: 'teste', roles })}
        sites={sites}
        headerEnd={<span className="text-sm">teste@orakel.local</span>}
      >
        <main
          id="conteudo"
          tabIndex={-1}
          className={classNames(
            'flex-auto bg-gray-100 focus-visible:outline-none dark:bg-gray-950',
            PAGE_CONTAINER_GUTTER_X,
            PAGE_CONTAINER_GUTTER_Y,
          )}
        >
          {ui}
        </main>
      </CollapsibleSide>
    </div>,
  );
}

/**
 * O casco das telas de lista (`sites/page.tsx`, `conteudos/page.tsx`, `revisao/page.tsx`…): a
 * seção na largura das listas e o cartão do template com o título e a tabela, para medir a
 * tabela na largura que ela tem na tela.
 */
export function ListScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby="lista-titulo" className="list-width space-y-4">
      <AdaptiveCard>
        <div className="flex flex-col gap-4">
          <ListHeader id="lista-titulo" title={title} />
          {children}
        </div>
      </AdaptiveCard>
    </section>
  );
}
