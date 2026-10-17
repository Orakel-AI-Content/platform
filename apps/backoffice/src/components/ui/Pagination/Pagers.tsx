// Ecme v1.3.10 (e5f9a1d): src/components/ui/Pagination/Pagers.tsx
// Adaptado (#214), pela acessibilidade; o cálculo das posições e dos "…" é o do Ecme:
// - cada posição é um <li> com <button> ou link (PagerControl), no lugar do
//   <li role="presentation"> com onClick; a lista (<ul>) é a da Pagination, que põe Anterior e
//   Próxima nela também;
// - nome "Página N" e `aria-current="page"` na atual; os "…" se chamam "Voltar 5 páginas" e
//   "Avançar 5 páginas", trocam o ícone também no foco do teclado (não só no hover) e, no modo
//   link, apontam para a página já limitada a 1..pageCount.
'use client';

import { useState, useCallback, useMemo } from 'react';
import classNames from '../utils/classNames';
import {
  HiOutlineChevronDoubleLeft,
  HiOutlineDotsHorizontal,
  HiChevronDoubleRight,
} from 'react-icons/hi';
import PagerControl from './PagerControl';
import type { PagerClass } from './PagerControl';

const PAGER_COUNT = 7;

const MORE_STEP = 5;

type More = 'nextMore' | 'prevMore';

type MoreProps = {
  className: string;
  href?: string;
  onArrow: (more: More) => void;
};

const NextMore = ({ className, href, onArrow }: MoreProps) => {
  const [quickNextArrowIcon, setQuickNextArrowIcon] = useState(false);

  return (
    <li>
      <PagerControl
        aria-label={`Avançar ${MORE_STEP} páginas`}
        className={className}
        href={href}
        onMouseEnter={() => setQuickNextArrowIcon(true)}
        onMouseLeave={() => setQuickNextArrowIcon(false)}
        onFocus={() => setQuickNextArrowIcon(true)}
        onBlur={() => setQuickNextArrowIcon(false)}
        onClick={() => onArrow('nextMore')}
      >
        {quickNextArrowIcon ? (
          <HiChevronDoubleRight aria-hidden />
        ) : (
          <HiOutlineDotsHorizontal aria-hidden />
        )}
      </PagerControl>
    </li>
  );
};

const PrevMore = ({ className, href, onArrow }: MoreProps) => {
  const [quickPrevArrowIcon, setQuickPrevArrowIcon] = useState(false);

  return (
    <li>
      <PagerControl
        aria-label={`Voltar ${MORE_STEP} páginas`}
        className={className}
        href={href}
        onMouseEnter={() => setQuickPrevArrowIcon(true)}
        onMouseLeave={() => setQuickPrevArrowIcon(false)}
        onFocus={() => setQuickPrevArrowIcon(true)}
        onBlur={() => setQuickPrevArrowIcon(false)}
        onClick={() => onArrow('prevMore')}
      >
        {quickPrevArrowIcon ? (
          <HiOutlineChevronDoubleLeft aria-hidden />
        ) : (
          <HiOutlineDotsHorizontal aria-hidden />
        )}
      </PagerControl>
    </li>
  );
};

type PagersProps = {
  pageCount: number;
  currentPage: number;
  getPageHref?: (page: number) => string;
  pagerClass: PagerClass;
  onChange: (page: number) => void;
};

type MoreState = { showPrevMore: boolean; showNextMore: boolean };

// Decide a exibição dos "..." a partir do estado anterior (alguns intervalos
// mantêm o valor anterior, por isso não é um cálculo puro das props).
const getMoreState = (previous: MoreState, currentPage: number, pageCount: number): MoreState => {
  if (pageCount <= PAGER_COUNT) {
    return { showPrevMore: false, showNextMore: false };
  }
  let { showPrevMore, showNextMore } = previous;
  if (currentPage > PAGER_COUNT - 2) {
    showPrevMore = true;
  }
  if (currentPage < pageCount - 2) {
    showNextMore = true;
  }
  if (currentPage >= pageCount - 3 && currentPage <= pageCount) {
    showNextMore = false;
  }
  if (currentPage >= 1 && currentPage <= 4) {
    showPrevMore = false;
  }
  return { showPrevMore, showNextMore };
};

const Pagers = (props: PagersProps) => {
  const { pageCount, currentPage, getPageHref, onChange, pagerClass } = props;

  const [{ showPrevMore, showNextMore }, setMoreState] = useState<MoreState>(() =>
    getMoreState({ showPrevMore: false, showNextMore: false }, currentPage, pageCount),
  );

  // Recalcula quando a página ou o total mudam (ajuste durante o render)
  const [prevDeps, setPrevDeps] = useState({ currentPage, pageCount });
  if (prevDeps.currentPage !== currentPage || prevDeps.pageCount !== pageCount) {
    setPrevDeps({ currentPage, pageCount });
    setMoreState(getMoreState({ showPrevMore, showNextMore }, currentPage, pageCount));
  }

  const clampPage = (value: number) => Math.min(Math.max(value, 1), pageCount);

  const onPagerClick = (value: number) => {
    const newPage = clampPage(value);

    if (newPage !== currentPage) {
      onChange(newPage);
    }
  };

  const onArrowClick = useCallback(
    (e: More) => {
      let newPage = currentPage;
      if (e === 'nextMore') {
        newPage = currentPage + MORE_STEP;
      }
      if (e === 'prevMore') {
        newPage = currentPage - MORE_STEP;
      }
      onChange(newPage);
    },
    [currentPage, onChange],
  );

  const getPages = useMemo(() => {
    const pagerArray = [];
    if (showPrevMore && !showNextMore) {
      const startPage = pageCount - (PAGER_COUNT - 2);
      for (let i = startPage; i < pageCount; i++) {
        pagerArray.push(i);
      }
    } else if (!showPrevMore && showNextMore) {
      for (let i = 2; i < PAGER_COUNT; i++) {
        pagerArray.push(i);
      }
    } else if (showPrevMore && showNextMore) {
      const offset = Math.floor(PAGER_COUNT / 2) - 1;
      const maxRange = currentPage >= pageCount - 2 && currentPage <= pageCount;
      for (let i = currentPage - offset; i <= currentPage + (maxRange ? 0 : offset); i++) {
        pagerArray.push(i);
      }
    } else {
      for (let i = 2; i < pageCount; i++) {
        pagerArray.push(i);
      }
    }
    if (pagerArray.length > PAGER_COUNT) {
      return [];
    }

    return pagerArray;
  }, [showPrevMore, showNextMore, currentPage, pageCount]);

  const getPagerClass = (index: number) => {
    return classNames(
      pagerClass.default,
      currentPage === index ? pagerClass.active : pagerClass.inactive,
    );
  };

  const renderPager = (pager: number) => (
    <li key={pager}>
      <PagerControl
        aria-label={`Página ${pager}`}
        className={getPagerClass(pager)}
        current={currentPage === pager}
        href={getPageHref?.(pager)}
        onClick={() => onPagerClick(pager)}
      >
        {pager}
      </PagerControl>
    </li>
  );

  const moreClass = classNames(pagerClass.default, pagerClass.inactive);

  return (
    <>
      {pageCount > 0 && renderPager(1)}
      {showPrevMore && (
        <PrevMore
          className={moreClass}
          href={getPageHref?.(clampPage(currentPage - MORE_STEP))}
          onArrow={(arrow) => onArrowClick(arrow)}
        />
      )}
      {getPages.map(renderPager)}
      {showNextMore && (
        <NextMore
          className={moreClass}
          href={getPageHref?.(clampPage(currentPage + MORE_STEP))}
          onArrow={(arrow) => onArrowClick(arrow)}
        />
      )}
      {pageCount > 1 && renderPager(pageCount)}
    </>
  );
};

export default Pagers;
