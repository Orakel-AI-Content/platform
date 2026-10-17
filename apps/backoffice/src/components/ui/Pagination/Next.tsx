// Ecme v1.3.10 (e5f9a1d): src/components/ui/Pagination/Next.tsx
// Adaptado (#214): <button> ou link (PagerControl) com o nome "Próxima página", no lugar do
// <span role="presentation">; desabilitado na última página. O ícone fica `aria-hidden`.
'use client';

import { HiChevronRight } from 'react-icons/hi';
import classNames from '../utils/classNames';
import PagerControl from './PagerControl';
import type { PagerClass } from './PagerControl';
import type { CommonProps } from '../@types/common';

interface NextProps extends CommonProps {
  currentPage: number;
  getPageHref?: (page: number) => string;
  pageCount: number;
  pagerClass: PagerClass;
  onNext: () => void;
}

const Next = (props: NextProps) => {
  const { currentPage, getPageHref, pageCount, pagerClass, onNext } = props;

  const disabled = currentPage === pageCount || pageCount === 0;

  const onNextClick = () => {
    if (disabled) {
      return;
    }
    onNext();
  };

  const pagerNextClass = classNames(
    pagerClass.default,
    'pagination-pager-next',
    disabled ? pagerClass.disabled : pagerClass.inactive,
  );

  return (
    <PagerControl
      aria-label="Próxima página"
      className={pagerNextClass}
      disabled={disabled}
      href={getPageHref?.(currentPage + 1)}
      onClick={onNextClick}
    >
      <HiChevronRight aria-hidden />
    </PagerControl>
  );
};

export default Next;
