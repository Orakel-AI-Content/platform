// Ecme v1.3.10 (e5f9a1d): src/components/shared/EllipsisButton.tsx
// Adaptado (#322):
// - `TbDots` → `PiDotsThreeBold` (o Backoffice usa só o `react-icons/pi`), num <span aria-hidden>:
//   o react-icons não marca o SVG;
// - o nome acessível é exigido pelo tipo: `aria-label` quando o botão é só o ícone, ou texto
//   visível nos filhos; o ícone deixa de ser trocável, para continuar escondido do leitor.
import { PiDotsThreeBold } from 'react-icons/pi';

import Button from '@/components/ui/Button';
import type { ButtonProps } from '@/components/ui/Button';
import type { ReactNode } from 'react';

type EllipsisButtonProps = Omit<ButtonProps, 'icon' | 'children' | 'aria-label'> &
  ({ 'aria-label': string; children?: undefined } | { children: ReactNode; 'aria-label'?: string });

const EllipsisButton = (props: EllipsisButtonProps) => {
  const { shape = 'circle', variant = 'plain', size = 'xs' } = props;

  return (
    <Button
      shape={shape}
      variant={variant}
      size={size}
      icon={
        <span aria-hidden="true" className="inline-flex">
          <PiDotsThreeBold />
        </span>
      }
      {...props}
    />
  );
};

export default EllipsisButton;
