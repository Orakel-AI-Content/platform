// Ecme v1.3.10 (e5f9a1d): src/components/ui/Progress/Progress.tsx
// Adaptado (#321), pela acessibilidade:
// - o `div.progress` é o `role="progressbar"`, com `aria-valuenow` (o `percent`),
//   `aria-valuemin` 0 e `aria-valuemax` 100, nas duas variantes; o nome vem de `aria-label` ou
//   `aria-labelledby`, que o Ecme não repassava a nenhum elemento;
// - o Ecme espalhava `{...props}` em `Line` e `Circle`, sobrescrevendo o `children` (o texto do
//   percentual) e o `strokeColor` calculados; aqui só o `trailClass` segue, explícito;
// - o texto do percentual (`.heading-text` no template) usa a cor de título do Ecme,
//   `text-gray-900`/`dark:text-gray-100`.
import classNames from '../utils/classNames';
import Line from './Line';
import Circle from './Circle';
import { SIZES, DIRECTIONS } from '../utils/constants';
import type { CommonProps } from '../@types/common';
import type { StrokeLinecap, GapPosition } from './Circle';
import type { HTMLAttributes, ReactNode, Ref } from 'react';

export interface ProgressProps
  extends CommonProps, Pick<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'aria-labelledby'> {
  customInfo?: string | ReactNode;
  customColorClass?: string;
  gapDegree?: number;
  gapPosition?: GapPosition;
  percent?: number;
  ref?: Ref<HTMLDivElement>;
  showInfo?: boolean;
  size?: 'sm' | 'md';
  strokeLinecap?: StrokeLinecap;
  strokeWidth?: number;
  trailClass?: string;
  width?: string | number;
  variant?: 'line' | 'circle';
}

const Progress = (props: ProgressProps) => {
  const {
    className,
    customInfo,
    customColorClass,
    gapDegree = 0,
    gapPosition = DIRECTIONS.TOP as GapPosition,
    id,
    percent = 0,
    ref,
    showInfo = true,
    size = SIZES.MD,
    strokeLinecap = 'round',
    strokeWidth = 6,
    style,
    trailClass,
    width = 120,
    variant = 'line',
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  } = props;

  const renderProcessInfo = () => {
    if (!showInfo) {
      return null;
    }
    return (
      <span className={`progress-info text-gray-900 dark:text-gray-100 font-bold ${variant}`}>
        {customInfo || `${percent}%`}
      </span>
    );
  };

  const strokeColor = customColorClass
    ? customColorClass
    : variant === 'line'
      ? 'bg-primary'
      : 'text-primary';

  const progressClass = classNames('progress', className, variant === 'circle' ? 'circle' : 'line');

  const renderProgress = () => {
    const progressInfo = renderProcessInfo();
    let progress;

    if (variant === 'line') {
      progress = (
        <Line percent={percent} size={size} strokeColor={strokeColor} trailClass={trailClass}>
          {progressInfo}
        </Line>
      );
    }

    if (variant === 'circle') {
      progress = (
        <Circle
          gapDegree={gapDegree}
          gapPosition={gapPosition}
          percent={percent}
          strokeColor={strokeColor}
          strokeLinecap={strokeLinecap}
          strokeWidth={strokeWidth}
          trailClass={trailClass}
          width={width}
        >
          {progressInfo}
        </Circle>
      );
    }

    return progress;
  };

  return (
    <div
      ref={ref}
      id={id}
      style={style}
      className={progressClass}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      {renderProgress()}
    </div>
  );
};

export default Progress;
