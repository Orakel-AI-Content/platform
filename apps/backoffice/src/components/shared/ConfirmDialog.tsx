// Ecme v1.3.10 (e5f9a1d): src/components/shared/ConfirmDialog.tsx
// Adaptado (#209):
// - `role="alertdialog"`, com o título ligado por `aria-labelledby` e o texto por
//   `aria-describedby`: a confirmação interrompe o fluxo, e o leitor de tela lê a pergunta;
// - cores do ícone pelos tokens do `@theme` (`info`, `success`, `warning`, `error` e os
//   `-subtle`), no lugar da paleta padrão do Tailwind (blue, emerald, amber e red), que o
//   Backoffice não usa; o ícone fica `aria-hidden`;
// - textos padrão em pt-BR ("Cancelar" e "Confirmar");
// - sem `onClose`, o Esc, o fundo e o botão Fechar chamam o `onCancel`.
'use client';

import {
  HiCheckCircle,
  HiOutlineInformationCircle,
  HiOutlineExclamation,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import useUniqueId from '@/components/ui/hooks/useUniqueId';
import type { ReactNode } from 'react';
import type { DialogProps } from '@/components/ui/Dialog';
import type { ButtonProps } from '@/components/ui/Button';

type StatusType = 'info' | 'success' | 'warning' | 'danger';

interface ConfirmDialogProps extends Omit<DialogProps, 'title'> {
  cancelText?: ReactNode | string;
  confirmText?: ReactNode | string;
  confirmButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  type?: StatusType;
  title?: ReactNode | string;
  onCancel?: () => void;
  onConfirm?: () => void;
}

const STATUS: Record<StatusType, { className: string; icon: ReactNode }> = {
  info: { className: 'bg-info-subtle text-info', icon: <HiOutlineInformationCircle /> },
  success: { className: 'bg-success-subtle text-success', icon: <HiCheckCircle /> },
  warning: { className: 'bg-warning-subtle text-warning', icon: <HiOutlineExclamationCircle /> },
  danger: { className: 'bg-error-subtle text-error', icon: <HiOutlineExclamation /> },
};

const StatusIcon = ({ status }: { status: StatusType }) => {
  const { className, icon } = STATUS[status];
  return (
    <Avatar className={className} shape="circle">
      <span aria-hidden className="text-2xl">
        {icon}
      </span>
    </Avatar>
  );
};

const ConfirmDialog = (props: ConfirmDialogProps) => {
  const {
    aria,
    type = 'info',
    title,
    children,
    onCancel,
    onClose,
    onConfirm,
    cancelText = 'Cancelar',
    confirmText = 'Confirmar',
    confirmButtonProps,
    cancelButtonProps,
    role = 'alertdialog',
    ...rest
  } = props;

  const titleId = useUniqueId('confirm-title-');
  const bodyId = useUniqueId('confirm-body-');

  const handleCancel = () => {
    onCancel?.();
  };

  const handleConfirm = () => {
    onConfirm?.();
  };

  return (
    <Dialog
      contentClassName="pb-0 px-0"
      role={role}
      aria={{
        ...(title ? { labelledby: titleId } : {}),
        ...(children ? { describedby: bodyId } : {}),
        ...aria,
      }}
      onClose={onClose ?? handleCancel}
      {...rest}
    >
      <div className="px-6 pb-6 pt-2 flex">
        <div>
          <StatusIcon status={type} />
        </div>
        <div className="ml-4 rtl:mr-4">
          <h5 id={titleId} className="mb-2">
            {title}
          </h5>
          <div id={bodyId}>{children}</div>
        </div>
      </div>
      <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl">
        <div className="flex justify-end items-center gap-2">
          <Button size="sm" onClick={handleCancel} {...cancelButtonProps}>
            {cancelText}
          </Button>
          <Button size="sm" variant="solid" onClick={handleConfirm} {...confirmButtonProps}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default ConfirmDialog;
