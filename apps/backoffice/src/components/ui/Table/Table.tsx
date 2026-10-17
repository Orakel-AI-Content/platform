// Ecme v1.3.10 (e5f9a1d): src/components/ui/Table/Table.tsx
import classNames from '../utils/classNames';
import type { ComponentPropsWithRef, ElementType } from 'react';

export interface TableProps extends ComponentPropsWithRef<'table'> {
  asElement?: ElementType;
  cellBorder?: boolean;
  compact?: boolean;
  hoverable?: boolean;
  overflow?: boolean;
}

const Table = (props: TableProps) => {
  const {
    asElement: Component = 'table',
    cellBorder,
    children,
    className,
    compact = false,
    hoverable = true,
    overflow = true,
    ref,
    ...rest
  } = props;

  const tableClass = classNames(
    Component === 'table' ? 'table-default' : 'table-flex',
    hoverable && 'table-hover',
    compact && 'table-compact',
    cellBorder && 'table-border',
    className,
  );

  return (
    <div className={classNames(overflow && 'overflow-x-auto')}>
      <Component className={tableClass} {...rest} ref={ref}>
        {children}
      </Component>
    </div>
  );
};

export default Table;
