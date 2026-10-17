// Ecme v1.3.10 (e5f9a1d): src/components/ui/Avatar/index.tsx
// Adaptado (#206, #211): o `Avatar.Group` entrou com o Tooltip (#211), de que depende.
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import AvatarBase, { type AvatarProps } from './Avatar';
import AvatarGroup from './AvatarGroup';

export type { AvatarProps } from './Avatar';
export type { AvatarGroupProps } from './AvatarGroup';

type CompoundedComponent = ForwardRefExoticComponent<
  AvatarProps & RefAttributes<HTMLSpanElement>
> & {
  Group: typeof AvatarGroup;
};

const Avatar = AvatarBase as CompoundedComponent;

Avatar.Group = AvatarGroup;

export { Avatar };

export default Avatar;
