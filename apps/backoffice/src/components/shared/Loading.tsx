// Ecme v1.3.10 (e5f9a1d): src/components/shared/Loading.tsx
// Adaptado (#206): o Spinner é `aria-hidden` (#205), então o Loading anuncia o carregamento. No
// `default`, a área ganha `role="status"` com "Carregando…" para leitores de tela; no `cover`, o
// contêiner fica com `aria-busy` e a sobreposição com o mesmo status.
import Spinner from '@/components/ui/Spinner';
import classNames from 'classnames';
import type { CommonProps } from '@/components/ui/@types/common';
import type { ElementType, ReactNode } from 'react';

interface BaseLoadingProps extends CommonProps {
  asElement?: ElementType;
  customLoader?: ReactNode;
  loading: boolean;
  spinnerClass?: string;
}

interface LoadingProps extends BaseLoadingProps {
  type?: 'default' | 'cover';
}

const DefaultLoading = (props: BaseLoadingProps) => {
  const {
    loading,
    children,
    spinnerClass,
    className,
    asElement: Component = 'div',
    customLoader,
  } = props;

  return loading ? (
    <Component
      role="status"
      className={classNames(!customLoader && 'flex items-center justify-center h-full', className)}
    >
      <span className="sr-only">Carregando…</span>
      {customLoader ? <>{customLoader}</> : <Spinner className={spinnerClass} size={40} />}
    </Component>
  ) : (
    <>{children}</>
  );
};

const CoveredLoading = (props: BaseLoadingProps) => {
  const {
    loading,
    children,
    spinnerClass,
    className,
    asElement: Component = 'div',
    customLoader,
  } = props;

  return (
    <Component
      className={classNames(loading ? 'relative' : '', className)}
      aria-busy={loading || undefined}
    >
      {children}
      {loading && (
        <div className="w-full h-full bg-white/50 dark:bg-gray-800/60 absolute inset-0" />
      )}
      {loading && (
        <div
          role="status"
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10"
        >
          <span className="sr-only">Carregando…</span>
          {customLoader ? <>{customLoader}</> : <Spinner className={spinnerClass} size={40} />}
        </div>
      )}
    </Component>
  );
};

const Loading = ({
  type = 'default',
  loading = false,
  asElement = 'div',
  ...rest
}: LoadingProps) => {
  switch (type) {
    case 'default':
      return <DefaultLoading loading={loading} asElement={asElement} {...rest} />;
    case 'cover':
      return <CoveredLoading loading={loading} asElement={asElement} {...rest} />;
    default:
      return <DefaultLoading loading={loading} asElement={asElement} {...rest} />;
  }
};

export default Loading;
