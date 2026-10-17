// Ecme v1.3.10 (e5f9a1d): src/components/ui/Avatar/AvatarGroup.tsx
// Adaptado (#211):
// - a dica do avatar omitido envolve o `Avatar` direto (no Ecme, um fragmento), para o Tooltip
//   pôr o `aria-describedby` nele;
// - o texto da dica em pt-BR ("N a mais", no lugar de "N More");
// - `cloneElement` sem `any`.
'use client';

import { Children, cloneElement, Fragment } from 'react';
import classNames from '../utils/classNames';
import Avatar from './Avatar';
import Tooltip from '../Tooltip/Tooltip';
import type { AvatarProps } from './Avatar';
import type { CommonProps } from '../@types/common';
import type { ReactNode, ReactElement } from 'react';
import type { TooltipProps } from '../Tooltip/Tooltip';

export interface AvatarGroupProps extends CommonProps {
  chained?: boolean;
  maxCount?: number;
  onOmittedAvatarClick?: () => void;
  omittedAvatarContent?: string | ReactNode;
  omittedAvatarProps?: AvatarProps;
  omittedAvatarTooltip?: boolean;
  omittedAvatarTooltipProps?: Omit<TooltipProps, 'title'>;
}

interface GroupContainerProps extends CommonProps, Pick<AvatarGroupProps, 'chained'> {}

const GroupContainer = ({ children, chained, className }: GroupContainerProps) => (
  <div className={classNames('avatar-group', chained && 'avatar-group-chained', className)}>
    {children}
  </div>
);

const AvatarGroup = (props: AvatarGroupProps) => {
  const {
    chained = false,
    children,
    className,
    maxCount = 4,
    onOmittedAvatarClick,
    omittedAvatarContent,
    omittedAvatarProps,
    omittedAvatarTooltip = false,
    omittedAvatarTooltipProps,
  } = props;

  const childCount = Children.count(children);

  const childWithKey = Children.toArray(children).map((child, index) =>
    cloneElement(child as ReactElement, {
      key: `grouped-avatar-${index}`,
    }),
  );

  if (maxCount && maxCount < childCount) {
    const childToShow = childWithKey.slice(0, maxCount);
    const overflowCount = childCount - maxCount;
    const avatar = (
      <Avatar
        className={onOmittedAvatarClick ? 'cursor-pointer' : ''}
        onClick={() => onOmittedAvatarClick?.()}
        {...omittedAvatarProps}
      >
        {omittedAvatarContent || `+${overflowCount}`}
      </Avatar>
    );

    childToShow.push(
      omittedAvatarTooltip ? (
        <Tooltip
          key="avatar-more-tooltip"
          title={`${overflowCount} a mais`}
          {...omittedAvatarTooltipProps}
        >
          {avatar}
        </Tooltip>
      ) : (
        <Fragment key="avatar-more-tooltip">{avatar}</Fragment>
      ),
    );
    return (
      <GroupContainer className={className} chained={chained}>
        {childToShow}
      </GroupContainer>
    );
  }

  return (
    <GroupContainer className={className} chained={chained}>
      {children}
    </GroupContainer>
  );
};

export default AvatarGroup;
