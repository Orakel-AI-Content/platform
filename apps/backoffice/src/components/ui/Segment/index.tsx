// Ecme v1.3.10 (e5f9a1d): src/components/ui/Segment/index.tsx
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import SegmentBase, { type SegmentProps } from './Segment';
import SegmentItem from './SegmentItem';

export type { SegmentProps } from './Segment';
export type { SegmentItemProps } from './SegmentItem';
export type { SegmentValue } from './context';

type CompoundedComponent = ForwardRefExoticComponent<
  SegmentProps & RefAttributes<HTMLDivElement>
> & {
  Item: typeof SegmentItem;
};

const Segment = SegmentBase as CompoundedComponent;

Segment.Item = SegmentItem;

export { Segment };

export default Segment;
