// Ecme v1.3.10 (e5f9a1d): src/components/ui/Progress/Circle.tsx
// Adaptado (#321): o <svg> sai com `aria-hidden` (o valor vem do `role="progressbar"` do
// Progress e do texto do centro); o caminho é calculado no render, sem `useCallback`.
import type { CommonProps } from '../@types/common';

export type StrokeLinecap = 'round' | 'square';
export type GapPosition = 'top' | 'right' | 'bottom' | 'left';

interface CircleProps extends CommonProps {
  gapDegree: number;
  gapPosition: GapPosition;
  percent: number;
  strokeColor?: string;
  strokeLinecap: StrokeLinecap;
  strokeWidth: number;
  trailClass?: string;
  width?: number | string;
}

function pathStyles(
  strokeWidth: number,
  percent: number,
  gapDegree: number,
  gapPosition: GapPosition,
) {
  const radius = 50 - strokeWidth / 2;

  let beginPositionX = 0;
  let beginPositionY = -radius;
  let endPositionX = 0;
  let endPositionY = -2 * radius;

  switch (gapPosition) {
    case 'left':
      beginPositionX = -radius;
      beginPositionY = 0;
      endPositionX = 2 * radius;
      endPositionY = 0;
      break;
    case 'right':
      beginPositionX = radius;
      beginPositionY = 0;
      endPositionX = -2 * radius;
      endPositionY = 0;
      break;
    case 'bottom':
      beginPositionY = radius;
      endPositionY = 2 * radius;
      break;
    default:
  }

  const pathString = `M 50,50 m ${beginPositionX},${beginPositionY} a ${radius},${radius} 0 1 1 ${endPositionX},${-endPositionY} a ${radius},${radius} 0 1 1 ${-endPositionX},${endPositionY}`;

  const len = Math.PI * 2 * radius;
  const trailPathStyle = {
    strokeDasharray: `${len - gapDegree}px ${len}px`,
    strokeDashoffset: `-${gapDegree / 2}px`,
  };

  const strokePathStyle = {
    strokeDasharray: `${(percent / 100) * (len - gapDegree)}px ${len}px`,
    strokeDashoffset: `-${gapDegree / 2}px`,
  };

  return { pathString, trailPathStyle, strokePathStyle };
}

const Circle = (props: CircleProps) => {
  const {
    strokeWidth,
    percent,
    strokeLinecap,
    gapDegree,
    gapPosition,
    strokeColor,
    width,
    children,
  } = props;

  const { pathString, trailPathStyle, strokePathStyle } = pathStyles(
    strokeWidth,
    percent,
    gapDegree,
    gapPosition,
  );

  const progressStrokeClass = `progress-circle-stroke ${strokeColor}`;

  return (
    <div className="progress-circle" style={{ width: width }}>
      <span className="progress-circle-info">{children}</span>
      <svg viewBox="0 0 100 100" aria-hidden>
        <path
          d={pathString}
          strokeWidth={strokeWidth}
          fillOpacity="0"
          style={trailPathStyle}
          className="progress-circle-trail"
        />
        <path
          d={pathString}
          strokeLinecap={strokeLinecap}
          strokeWidth={percent === 0 ? 0 : strokeWidth}
          fillOpacity="0"
          style={strokePathStyle}
          className={progressStrokeClass}
        />
      </svg>
    </div>
  );
};

Circle.displayName = 'ProgressCircle';

export default Circle;
