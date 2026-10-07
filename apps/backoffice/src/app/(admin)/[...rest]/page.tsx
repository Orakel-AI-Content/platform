import { notFound } from 'next/navigation';

// Endereço que não casa com nenhuma rota (#77): sem este catch-all, cairia no 404 padrão do
// Next, fora do layout (admin). As rotas específicas vencem; aqui só chega o resto.
export default function UnknownRoute(): never {
  notFound();
}
