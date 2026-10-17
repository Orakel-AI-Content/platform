// Ecme v1.3.10 (e5f9a1d): src/components/ui/Table/Sorter.tsx
// Adaptado (#213): os ícones ficam `aria-hidden`; o estado da ordenação vem do `aria-sort` do
// Th (prop `sort`).
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import classNames from '../utils/classNames';

export type SorterProps = {
  className?: string;
  sort?: boolean | 'asc' | 'desc';
};

const Sorter = ({ sort, className }: SorterProps) => {
  const color = 'text-primary';

  const renderSort = () => {
    if (typeof sort === 'boolean') {
      return <FaSort />;
    }

    if (sort === 'asc') {
      return <FaSortUp className={color} />;
    }

    if (sort === 'desc') {
      return <FaSortDown className={color} />;
    }

    return null;
  };

  return (
    <div aria-hidden className={classNames('inline-flex', className)}>
      {renderSort()}
    </div>
  );
};

export default Sorter;
