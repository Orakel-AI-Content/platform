// Ecme v1.3.10 (e5f9a1d): src/components/template/VerticalMenuContent/VerticalMenuIcon.tsx
// Adaptado (#237): o `icon` já é uma chave do mapa (tipada pela #236), então não há o caso do
// ícone ausente; o ícone é `aria-hidden` no próprio mapa.
import navigationIcon, { type NavigationIconKey } from '@/configs/navigation-icon.config';

const VerticalMenuIcon = ({ icon }: { icon: NavigationIconKey }) => {
  return <span className="text-2xl">{navigationIcon[icon]}</span>;
};

export default VerticalMenuIcon;
