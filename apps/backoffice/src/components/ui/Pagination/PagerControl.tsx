// Adaptado (#214), sem equivalente no Ecme: o controle de cada posição da Pagination. O Ecme
// usava <span>/<li role="presentation"> com onClick, sem foco nem nome; aqui é um <button> ou,
// com `href`, um `next/link`, para a paginação funcionar sem JS com o estado na URL. Link não
// tem `disabled`: desabilitado no modo link vira <span role="link" aria-disabled="true"> sem
// href (link desabilitado do APG; o papel é o que permite o nome por aria-label).
'use client';

import Link from 'next/link';
import type { FocusEventHandler, MouseEventHandler, ReactNode } from 'react';

export type PagerClass = {
  default: string;
  inactive: string;
  active: string;
  disabled: string;
};

type PagerControlProps = {
  'aria-label': string;
  children: ReactNode;
  className: string;
  current?: boolean;
  disabled?: boolean;
  href?: string;
  onBlur?: FocusEventHandler<HTMLElement>;
  onClick?: MouseEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
};

const PagerControl = (props: PagerControlProps) => {
  const { children, current, disabled, href, ...rest } = props;
  const ariaCurrent = current ? ('page' as const) : undefined;

  if (href === undefined) {
    return (
      <button type="button" disabled={disabled} aria-current={ariaCurrent} {...rest}>
        {children}
      </button>
    );
  }

  if (disabled) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={rest['aria-label']}
        className={rest.className}
      >
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-current={ariaCurrent} {...rest}>
      {children}
    </Link>
  );
};

export default PagerControl;
