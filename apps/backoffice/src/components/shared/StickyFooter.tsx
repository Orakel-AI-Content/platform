// Ecme v1.3.10 (e5f9a1d): src/components/shared/StickyFooter.tsx
// Adaptado (#206): debounce local (o `useDebounce` do template vem do es-toolkit), sem o
// `console.log` e sem o `window.scrollTo` suave até o fim da página quando o rodapé fica todo
// visível: rolar a página sem ação da pessoa é movimento não pedido.
'use client';

import { useRef, useState, useEffect } from 'react';
import classNames from 'classnames';
import type { HTMLAttributes, ReactNode } from 'react';

interface StickyFooterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  stickyClass?: string;
  defaultClass?: string;
  children?: ReactNode | ((isSticky: boolean) => ReactNode);
}

const DEBOUNCE_MS = 100;

const StickyFooter = (props: StickyFooterProps) => {
  const { children, className, stickyClass, defaultClass, ...rest } = props;

  const [isSticky, setIsSticky] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cachedRef = ref.current;
    if (!cachedRef) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const sticky = entry.intersectionRatio < 1;
        clearTimeout(timer);
        timer = setTimeout(() => setIsSticky(sticky), DEBOUNCE_MS);
      },
      {
        threshold: [1],
      },
    );

    observer.observe(cachedRef);

    return function () {
      clearTimeout(timer);
      observer.unobserve(cachedRef);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={classNames(
        'static -bottom-[1px]',
        className,
        isSticky ? classNames(stickyClass, 'sticky') : defaultClass,
      )}
      {...rest}
    >
      {typeof children === 'function' ? children(isSticky) : children}
    </div>
  );
};

export default StickyFooter;
