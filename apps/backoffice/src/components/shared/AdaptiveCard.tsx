// Ecme v1.3.10 (e5f9a1d): src/components/shared/AdaptiveCard.tsx
// Adaptado (#206): sem o `useLayout` do template. O Backoffice tem layout único, em que o
// `adaptiveCardActive` do Ecme é sempre falso: o cartão fica com borda e espaçamento do Card.
import Card from '@/components/ui/Card';
import type { CardProps } from '@/components/ui/Card';

type AdaptableCardProps = CardProps;

const AdaptiveCard = (props: AdaptableCardProps) => <Card {...props} />;

export default AdaptiveCard;
