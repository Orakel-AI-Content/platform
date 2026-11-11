// Ecme v1.3.10 (e5f9a1d): src/components/ui/Timeline/TimeLineItem.tsx
// Adaptado (#646): `classNames` de `ui/utils`; o marcador (o padrão ou o `media`) e o conector
// ficam `aria-hidden`, fora da árvore de acessibilidade: o leitor de tela lê só o conteúdo do
// item, e o que o marcador indicar vai em texto no conteúdo.
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';
import type { ReactNode, Ref } from 'react';

export interface TimeLineItemProps extends CommonProps {
  isLast?: boolean;
  media?: string | ReactNode;
  ref?: Ref<HTMLLIElement>;
}

const TimeLineItem = (props: TimeLineItemProps) => {
  const { children, className, isLast, media, ref } = props;

  return (
    <li
      ref={ref}
      className={classNames('timeline-item', isLast ? 'timeline-item-last' : '', className)}
    >
      <div className="timeline-item-wrapper">
        <div className="timeline-item-media" aria-hidden="true">
          <div className="timeline-item-media-content">
            {media || <div className="timeline-item-media-default" />}
          </div>
          {!isLast && <div className="timeline-connect" />}
        </div>
        <div
          className={classNames('timeline-item-content', isLast && 'timeline-item-content-last')}
        >
          {children}
        </div>
      </div>
    </li>
  );
};

export default TimeLineItem;
