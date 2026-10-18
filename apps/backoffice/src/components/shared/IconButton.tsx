// Sem equivalente no Ecme (#270): o botão só de ícone com dica do Backoffice (#131), agora
// sobre o `Button` (com `icon`, `plain`, `xs`: 32 px) e o `Tooltip` do Ecme.
// - o nome acessível vem do `aria-label`; o ícone fica `aria-hidden` (o react-icons não marca
//   o SVG);
// - a dica é só visual: o `Tooltip` liga o texto ao filho por `aria-describedby`, e aqui a
//   descrição repetiria o nome, então o botão a descarta e o leitor de tela lê o rótulo uma vez;
// - `aria-disabled` (não `disabled`) mantém o botão no Tab e deixa o clique chegar, com a
//   aparência de indisponível.
'use client';

import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import classNames from '@/components/ui/utils/classNames';

type IconButtonProps = Omit<ButtonProps, 'children' | 'aria-label' | 'icon'> & {
  /** Nome acessível e texto da dica ("Mover bloco 3 para cima"). */
  label: string;
  /** Ícone do `react-icons/pi` (ou outro SVG), desenhado em 16 px. */
  icon: ReactNode;
};

/**
 * O filho que o `Tooltip` clona: o `aria-describedby` que ele injeta fica de fora, e só a
 * descrição do próprio chamador (`describedBy`) chega ao botão.
 */
function IconButtonControl({ describedBy, ...props }: ButtonProps & { describedBy?: string }) {
  // O `aria-describedby` depois do spread substitui o do `Tooltip`.
  return <Button {...props} aria-describedby={describedBy} />;
}

export function IconButton({
  label,
  icon,
  className,
  type = 'button',
  variant = 'plain',
  size = 'xs',
  'aria-describedby': describedBy,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip title={label} wrapperClass="inline-flex">
      <IconButtonControl
        type={type}
        variant={variant}
        size={size}
        aria-label={label}
        describedBy={describedBy}
        icon={
          <span aria-hidden="true" className="inline-flex">
            {icon}
          </span>
        }
        className={classNames(
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </Tooltip>
  );
}

export default IconButton;
