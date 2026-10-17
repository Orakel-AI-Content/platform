// Ecme v1.3.10 (e5f9a1d): src/components/ui/Pagination/Pagination.tsx
// Adaptado (#214), pela acessibilidade:
// - <nav aria-label="Paginação"> no lugar da <div>, com Anterior, as páginas e Próxima numa
//   única <ul>;
// - `getPageHref(page)` opcional: com ele, cada posição é um `next/link` para a URL que quem
//   chama monta (a lista conhece os outros filtros da query), e a paginação funciona sem JS;
// - página atual no escuro com `dark:text-gray-950` sobre `dark:bg-primary` (o `text-neutral`
//   do Ecme não chega a 4,5:1; docs/migration/ecme.md).
'use client';

import { useState, useMemo } from 'react';
import Pager from './Pagers';
import Prev from './Prev';
import Next from './Next';
import Total from './Total';
import useControllableState from '../hooks/useControllableState';
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';

export interface PaginationProps extends CommonProps {
  currentPage?: number;
  displayTotal?: boolean;
  getPageHref?: (page: number) => string;
  onChange?: (pageNumber: number) => void;
  pageSize?: number;
  total?: number;
}

const defaultTotal = 5;

const Pagination = (props: PaginationProps) => {
  const {
    className,
    currentPage = 1,
    displayTotal = false,
    getPageHref,
    onChange,
    pageSize = 1,
    total = 5,
  } = props;

  const [paginationTotal] = useControllableState({
    prop: total,
    defaultProp: defaultTotal,
    onChange,
  });

  const [internalPageSize, setInternalPageSize] = useState(pageSize);

  const getInternalPageCount = useMemo(() => {
    if (typeof paginationTotal === 'number') {
      return Math.ceil(paginationTotal / internalPageSize);
    }
    return null;
  }, [paginationTotal, internalPageSize]);

  const getValidCurrentPage = (count: number | string) => {
    const value = parseInt(count as string, 10);
    const internalPageCount = getInternalPageCount;
    let resetValue;
    if (!internalPageCount) {
      if (isNaN(value) || value < 1) {
        resetValue = 1;
      }
    } else {
      if (value < 1) {
        resetValue = 1;
      }
      if (value > internalPageCount) {
        resetValue = internalPageCount;
      }
    }

    if ((resetValue === undefined && isNaN(value)) || resetValue === 0) {
      resetValue = 1;
    }

    return resetValue === undefined ? value : resetValue;
  };

  // O valor controlado pela prop prevalece (antes aplicado por efeito no mount)
  const [internalCurrentPage, setInternalCurrentPage] = useState(currentPage);

  // Sincroniza com as props durante o render (sem efeito em cascata)
  const [prevProps, setPrevProps] = useState({ pageSize, currentPage });
  if (prevProps.pageSize !== pageSize || prevProps.currentPage !== currentPage) {
    setPrevProps({ pageSize, currentPage });
    if (pageSize !== internalPageSize) {
      setInternalPageSize(pageSize);
    }
    if (currentPage !== internalCurrentPage) {
      setInternalCurrentPage(currentPage);
    }
  }

  const onPaginationChange = (val: number) => {
    setInternalCurrentPage(getValidCurrentPage(val));
    onChange?.(getValidCurrentPage(val));
  };

  const onPrev = () => {
    const newPage = internalCurrentPage - 1;
    setInternalCurrentPage(getValidCurrentPage(newPage));
    onChange?.(getValidCurrentPage(newPage));
  };

  const onNext = () => {
    const newPage = internalCurrentPage + 1;
    setInternalCurrentPage(getValidCurrentPage(newPage));
    onChange?.(getValidCurrentPage(newPage));
  };

  const pagerClass = {
    default: 'pagination-pager',
    inactive: 'pagination-pager-inactive',
    active: `text-primary dark:bg-primary dark:text-gray-950`,
    disabled: 'pagination-pager-disabled',
  };

  const paginationClass = classNames('pagination', className);

  return (
    <nav aria-label="Paginação" className={paginationClass}>
      {displayTotal && <Total total={total} />}
      <ul className="pagination-list">
        <li>
          <Prev
            currentPage={internalCurrentPage}
            getPageHref={getPageHref}
            pagerClass={pagerClass}
            onPrev={onPrev}
          />
        </li>
        <Pager
          pageCount={getInternalPageCount as number}
          currentPage={internalCurrentPage}
          getPageHref={getPageHref}
          pagerClass={pagerClass}
          onChange={onPaginationChange}
        />
        <li>
          <Next
            currentPage={internalCurrentPage}
            getPageHref={getPageHref}
            pageCount={getInternalPageCount as number}
            pagerClass={pagerClass}
            onNext={onNext}
          />
        </li>
      </ul>
    </nav>
  );
};

Pagination.displayName = 'Pagination';

export default Pagination;
