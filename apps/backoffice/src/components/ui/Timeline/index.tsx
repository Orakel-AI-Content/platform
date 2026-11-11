// Ecme v1.3.10 (e5f9a1d): src/components/ui/Timeline/index.tsx
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import TimelineBase, { type TimelineProps } from './Timeline';
import TimeLineItem from './TimeLineItem';

export type { TimelineProps } from './Timeline';
export type { TimeLineItemProps } from './TimeLineItem';

type CompoundedComponent = ForwardRefExoticComponent<
  TimelineProps & RefAttributes<HTMLUListElement>
> & {
  Item: typeof TimeLineItem;
};

const Timeline = TimelineBase as CompoundedComponent;

Timeline.Item = TimeLineItem;

export { Timeline };

export default Timeline;
