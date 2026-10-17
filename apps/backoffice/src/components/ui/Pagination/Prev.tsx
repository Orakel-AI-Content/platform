// Ecme v1.3.10 (e5f9a1d): src/components/ui/Pagination/Prev.tsx
// Adaptado (#214): <button> ou link (PagerControl) com o nome "Página anterior", no lugar do
// <span role="presentation">; desabilitado na primeira página. O ícone fica `aria-hidden`.
'use client';

import { HiChevronLeft } from 'react-icons/hi';
import classNames from '../utils/classNames';
import PagerControl from './PagerControl';
import type { PagerClass } from './PagerControl';
import type { CommonProps } from '../@types/common';

interface PrevProps extends CommonProps {
  currentPage: number;
  getPageHref?: (page: number) => string;
  pagerClass: PagerClass;
  onPrev: () => void;
}

const Prev = (props: PrevProps) => {
  const { currentPage, getPageHref, pagerClass, onPrev } = props;

  const disabled = currentPage <= 1;

  const onPrevClick = () => {
    if (disabled) {
      return;
    }
    onPrev();
  };

  const pagerPrevClass = classNames(
    pagerClass.default,
    'pagination-pager-prev',
    disabled ? pagerClass.disabled : pagerClass.inactive,
  );

  return (
    <PagerControl
      aria-label="Página anterior"
      className={pagerPrevClass}
      disabled={disabled}
      href={getPageHref?.(currentPage - 1)}
      onClick={onPrevClick}
    >
      <HiChevronLeft aria-hidden />
    </PagerControl>
  );
};

export default Prev;
