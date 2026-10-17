// Ecme v1.3.10 (e5f9a1d): src/components/ui/Table/Td.tsx
import type { ComponentPropsWithRef, ElementType } from 'react';

export interface TdProps extends ComponentPropsWithRef<'td'> {
  asElement?: ElementType;
}

const Td = (props: TdProps) => {
  const { asElement: Component = 'td', children, ref, ...rest } = props;

  return (
    <Component {...rest} ref={ref}>
      {children}
    </Component>
  );
};

export default Td;
