// Ecme v1.3.10 (e5f9a1d): src/components/shared/Container.tsx
import classNames from '@/components/ui/utils/classNames';
import type { CommonProps } from '@/components/ui/@types/common';
import type { ElementType, Ref } from 'react';

interface ContainerProps extends CommonProps {
  asElement?: ElementType;
  ref?: Ref<HTMLElement>;
}

const Container = (props: ContainerProps) => {
  const { className, children, asElement: Component = 'div', ref, ...rest } = props;

  return (
    <Component ref={ref} className={classNames('container mx-auto', className)} {...rest}>
      {children}
    </Component>
  );
};

export default Container;
