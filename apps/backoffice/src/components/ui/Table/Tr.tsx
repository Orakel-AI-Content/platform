// Ecme v1.3.10 (e5f9a1d): src/components/ui/Table/Tr.tsx
import type { ComponentPropsWithRef, ElementType } from 'react';

export interface TrProps extends ComponentPropsWithRef<'tr'> {
  asElement?: ElementType;
}

const Tr = (props: TrProps) => {
  const { asElement: Component = 'tr', children, ref, ...rest } = props;

  return (
    <Component {...rest} ref={ref}>
      {children}
    </Component>
  );
};

export default Tr;
