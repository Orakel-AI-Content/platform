// Ecme v1.3.10 (e5f9a1d): src/components/template/Header.tsx
import classNames from '@/components/ui/utils/classNames';
import { HEADER_HEIGHT } from './constants';
import type { ReactNode } from 'react';
import type { CommonProps } from '@/components/ui/@types/common';

interface HeaderProps extends CommonProps {
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  headerMiddle?: ReactNode;
  container?: boolean;
  wrapperClass?: string;
}

const Header = (props: HeaderProps) => {
  const { headerStart, headerEnd, headerMiddle, className, container, wrapperClass } = props;

  return (
    <header className={classNames('header', className)}>
      <div
        className={classNames('header-wrapper', container && 'container mx-auto', wrapperClass)}
        style={{ height: HEADER_HEIGHT }}
      >
        <div className="header-action header-action-start">{headerStart}</div>
        {headerMiddle && <div className="header-action header-action-middle">{headerMiddle}</div>}
        <div className="header-action header-action-end">{headerEnd}</div>
      </div>
    </header>
  );
};

export default Header;
