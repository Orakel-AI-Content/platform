// Ecme v1.3.10 (e5f9a1d): src/components/ui/Progress/Line.tsx
// Adaptado (#321): `classNames` de `ui/utils`; a barra é só desenho (o valor vem do
// `role="progressbar"` do Progress).
import classNames from '../utils/classNames';
import { SIZES } from '../utils/constants';
import type { CommonProps } from '../@types/common';

interface LineProps extends CommonProps {
  percent: number;
  strokeColor?: string;
  trailClass?: string;
  size?: 'sm' | 'md';
}

const Line = (props: LineProps) => {
  const { percent, size, children, strokeColor, trailClass } = props;

  const progressBackgroundClass = classNames(
    'progress-bg',
    size === SIZES.SM ? 'h-1.5' : 'h-2',
    strokeColor,
  );

  return (
    <>
      <div className="progress-wrapper">
        <div className={classNames('progress-inner', trailClass)}>
          <div className={progressBackgroundClass} style={{ width: `${percent}%` }} />
        </div>
      </div>
      {children}
    </>
  );
};

Line.displayName = 'ProgressLine';

export default Line;
