// Ecme v1.3.10 (e5f9a1d): src/components/ui/utils/classNames.ts
import cn from 'classnames';
import { twMerge } from 'tailwind-merge';

export default function classNames(...args: cn.ArgumentArray) {
  return twMerge(cn(args));
}
