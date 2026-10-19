// Ecme v1.3.10 (e5f9a1d): src/components/ui/Skeleton/Skeleton.tsx
// Adaptado (#206): `aria-hidden`, fora da árvore de acessibilidade (é só a forma do conteúdo que
// vem); quem carrega anuncia com o Loading ou `aria-busy`.
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';
import type { ElementType, Ref } from 'react';

export interface SkeletonProps extends CommonProps {
  animation?: boolean;
  asElement?: ElementType;
  height?: string | number;
  ref?: Ref<ElementType>;
  variant?: 'block' | 'circle';
  width?: string | number;
}

const Skeleton = (props: SkeletonProps) => {
  const {
    animation = true,
    asElement: Component = 'span',
    className,
    height,
    ref,
    style,
    variant = 'block',
    width,
  } = props;

  return (
    <Component
      ref={ref}
      aria-hidden
      className={classNames(
        'skeleton',
        variant === 'circle' && 'skeleton-circle',
        variant === 'block' && 'skeleton-block',
        animation && 'animate-pulse',
        className,
      )}
      style={{
        width,
        height,
        ...style,
      }}
    />
  );
};

export default Skeleton;
