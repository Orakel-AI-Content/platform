// Fronteira de cliente do `ui/Button` com `next/link` (#247): uma página (Server Component) não
// pode passar `asElement={Link}` ao Button, que é Client Component (função não atravessa a
// fronteira servidor→cliente). Este wrapper só faz esse repasse; o visual é o do Button.
'use client';

import Link from 'next/link';

import Button from './Button';
import type { ButtonProps } from './Button';

export type ButtonLinkProps = Omit<ButtonProps, 'asElement' | 'download' | 'href'> & {
  href: string;
};

const ButtonLink = (props: ButtonLinkProps) => <Button asElement={Link} {...props} />;

export default ButtonLink;
