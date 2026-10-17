// Ecme v1.3.10 (e5f9a1d): src/components/ui/Table/index.tsx
import TableBase from './Table';
import THead from './THead';
import TBody from './TBody';
import TFoot from './TFoot';
import Tr from './Tr';
import Th from './Th';
import Td from './Td';
import Sorter from './Sorter';

import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { TableProps } from './Table';

export type { TableProps } from './Table';
export type { THeadProps } from './THead';
export type { TBodyProps } from './TBody';
export type { TFootProps } from './TFoot';
export type { TrProps } from './Tr';
export type { ThProps, ThSort } from './Th';
export type { TdProps } from './Td';
export type { SorterProps } from './Sorter';

type CompoundedComponent = ForwardRefExoticComponent<TableProps & RefAttributes<HTMLElement>> & {
  THead: typeof THead;
  TBody: typeof TBody;
  TFoot: typeof TFoot;
  Th: typeof Th;
  Tr: typeof Tr;
  Td: typeof Td;
  Sorter: typeof Sorter;
};

const Table = TableBase as CompoundedComponent;

Table.THead = THead;
Table.TBody = TBody;
Table.TFoot = TFoot;
Table.Th = Th;
Table.Tr = Tr;
Table.Td = Td;
Table.Sorter = Sorter;

export { Table };

export default Table;
