import { StatusScreen } from '@/components/status-screen';

// Navegação entre telas (#77): toda página consulta o banco na hora (force-dynamic), e este
// indicador aparece até a próxima tela chegar. Anunciado por leitor de tela.
export default function Loading() {
  return (
    <StatusScreen title="Carregando…" live>
      Buscando os dados da tela.
    </StatusScreen>
  );
}
