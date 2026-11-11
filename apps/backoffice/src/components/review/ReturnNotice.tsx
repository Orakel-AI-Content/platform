import { formatDateTime } from '@/components/shared/siteLabels.ts';
import Alert from '@/components/ui/Alert';
import type { PendingReturn } from '@/domain/reviews/reviews.ts';

// Devolução pendente (#598) no detalhe do conteúdo e no editor: o que corrigir, quem devolveu e
// quando, no `Alert` de aviso do Ecme, com título. Sem `role="alert"`: chega no carregamento, não
// é retorno de uma ação (como os problemas de validação da revisão, #444). O comentário guarda as
// quebras de linha que o revisor escreveu.

export function ReturnNotice({
  pending,
  timeZone,
}: {
  pending: Pick<PendingReturn, 'version' | 'reviewer' | 'comment' | 'returnedAt'>;
  /** Fuso do site: a data aparece nele, como nas versões. */
  timeZone: string;
}) {
  return (
    <Alert
      type="warning"
      showIcon
      duration={0}
      title={`Versão ${pending.version} devolvida ao editor`}
    >
      <p className="text-sm whitespace-pre-line">{pending.comment}</p>
      <p className="mt-1 text-sm font-normal">
        {pending.reviewer} · {formatDateTime(pending.returnedAt, timeZone)}
      </p>
    </Alert>
  );
}
