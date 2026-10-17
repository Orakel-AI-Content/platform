// Ecme v1.3.10 (e5f9a1d): src/components/ui/Badge/Badge.tsx
// Adaptado (#206): só tokens do @theme (`text-neutral` e `border-neutral` no lugar de `white`) e
// texto escuro no tema escuro: o branco sobre o `error` do escuro dá 2,82:1 (par em ECME_PAIRS).
import classNames from '../utils/classNames';
import type { CommonProps } from '../@types/common';
import type { CSSProperties, Ref } from 'react';

export interface BadgeProps extends CommonProps {
  badgeStyle?: CSSProperties;
  content?: string | number;
  innerClass?: string;
  maxCount?: number;
  ref?: Ref<HTMLSpanElement>;
}

const Badge = (props: BadgeProps) => {
  const {
    badgeStyle,
    children,
    className,
    content,
    innerClass,
    maxCount = 99,
    ref,
    ...rest
  } = props;

  const badgeBaseClass =
    'rounded-full text-xs font-semibold bg-error text-neutral dark:text-gray-950';

  const dot = typeof content !== 'number' && typeof content !== 'string';

  const badgeClass = classNames(
    dot
      ? 'badge-dot w-3 h-3 border border-neutral dark:border-gray-900'
      : 'badge px-2 py-1 min-w-6',
    badgeBaseClass,
    innerClass,
  );

  const renderBadge = () => {
    if (children) {
      return (
        <span ref={ref} className={classNames('badge-wrapper relative flex', className)} {...rest}>
          <span className={classNames(badgeClass, 'badge-inner')} style={badgeStyle}>
            {typeof content === 'number' && content > maxCount ? `${maxCount}+` : content}
          </span>
          {children}
        </span>
      );
    }
    return (
      <span ref={ref} className={classNames(badgeClass, className)} style={badgeStyle} {...rest}>
        {content}
      </span>
    );
  };

  return renderBadge();
};

Badge.displayName = 'Badge';

export default Badge;
