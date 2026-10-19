// Ecme v1.3.10 (e5f9a1d): src/components/template/BottomStickyBar.tsx
// Adaptado (#322):
// - sem o `useLayout`: o Backoffice só tem a moldura CollapsibleSide, em que o Ecme usa `sticky`
//   (o `fixed` é do `contentOverlay`);
// - a margem negativa acompanha os gutters do `main` (`PAGE_CONTAINER_GUTTER_X`,
//   `px-4 sm:px-6 md:px-8`), não o `-mx-4 sm:-mx-8` do template, para a barra encostar nas
//   bordas do `main` em todo breakpoint. Mudou a constante, mude aqui (o teste confere).
import classNames from '@/components/ui/utils/classNames';
import type { CommonProps } from '@/components/ui/@types/common';

export type BottomStickyBarProps = Pick<CommonProps, 'children'>;

const BottomStickyBar = ({ children }: BottomStickyBarProps) => {
  return (
    <div
      className={classNames(
        'bottom-0 left-0 right-0 z-10 mt-8 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 -mx-4 sm:-mx-6 md:-mx-8 py-4',
        'sticky',
      )}
    >
      {children}
    </div>
  );
};

export default BottomStickyBar;
