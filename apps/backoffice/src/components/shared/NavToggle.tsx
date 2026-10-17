// Ecme v1.3.10 (e5f9a1d): src/components/shared/NavToggle.tsx
// Adaptado (#235): os ícones ficam `aria-hidden`. Como no Ecme, o NavToggle é só o ícone, sem
// papel próprio: quem o usa (o SideNavToggle) o põe num botão com nome e `aria-expanded`.
import { HiOutlineMenuAlt2, HiOutlineMenu } from 'react-icons/hi';
import type { CommonProps } from '@/components/ui/@types/common';

export interface NavToggleProps extends CommonProps {
  toggled?: boolean;
}

const NavToggle = ({ toggled, className }: NavToggleProps) => {
  return (
    <div className={className}>
      {toggled ? <HiOutlineMenu aria-hidden /> : <HiOutlineMenuAlt2 aria-hidden />}
    </div>
  );
};

export default NavToggle;
