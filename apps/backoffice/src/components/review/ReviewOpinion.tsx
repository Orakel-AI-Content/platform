import { useId } from 'react';

import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import type { StateTagColor } from '@/components/shared/siteLabels.ts';
import { StateTag } from '@/components/sites/SiteStatus';
import Card from '@/components/ui/Card';
import type { OpinionPointKey, OpinionVerdict } from '@/domain/reviews/opinion.ts';
import type { OpinionState } from '@/domain/reviews/opinions.ts';

// Parecer automático da revisão (workspace#94): o que o modelo achou dos pontos subjetivos, no
// passo Leitura, acima do checklist. Só informa: fica fora de `blocked`, e o revisor confirma ou
// discorda pelo checklist e pela decisão. No padrão do `ReviewChecks` (Card do Ecme, `h2` de
// seção, lista com divisórias), sem `'use client'`. Os rótulos dos pontos vêm da página
// (`OPINION_POINTS`): `opinion.ts` importa o SDK do modelo e não entra no bundle do cliente.

/** Ponto avaliado, com o rótulo lido de `OPINION_POINTS` pela página. */
export type OpinionPointLabel = { key: OpinionPointKey; label: string };

const VERDICT: Record<OpinionVerdict, { text: string; color: StateTagColor }> = {
  atende: { text: 'Atende', color: 'bg-success' },
  nao_atende: { text: 'Não atende', color: 'bg-error' },
  inconclusivo: { text: 'Inconclusivo', color: 'bg-warning' },
  nao_avaliado: { text: 'Não avaliado', color: 'bg-gray-400' },
};

/** Aviso no lugar dos pontos, quando o parecer não está pronto. */
const NOTICE: Record<Exclude<OpinionState['state'], 'pronto'>, string> = {
  pendente: 'Parecer em preparação. Recarregue a página em instantes para vê-lo.',
  falha: 'Não foi possível fazer o parecer desta versão.',
  ausente: 'Esta versão não tem parecer: foi enviada antes de ele existir.',
};

const NOT_EVALUATED = 'O site não tem contexto editorial para comparar.';

export function ReviewOpinion({
  state,
  points,
}: {
  state: OpinionState;
  points: readonly OpinionPointLabel[];
}) {
  const id = useId();
  return (
    <Card>
      <section aria-labelledby={`${id}-title`} className="space-y-3">
        <h2 id={`${id}-title`} className={SECTION_TITLE_CLASS}>
          Parecer automático
        </h2>
        <p className={SECTION_HINT_CLASS}>
          Avaliação do modelo sobre os pontos subjetivos. Só informa: não aprova, não devolve e não
          impede aprovar.
        </p>
        {state.state === 'pronto' ? (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {points.map(({ key, label }) => {
              const point = state.opinion[key];
              const verdict = VERDICT[point.verdict];
              return (
                <li key={key} className="space-y-1 py-2 text-sm first:pt-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 font-semibold text-gray-900 dark:text-gray-100">
                      {label}
                    </span>
                    <StateTag color={verdict.color} className="shrink-0">
                      {verdict.text}
                    </StateTag>
                  </div>
                  {'justification' in point ? (
                    <>
                      <p>{point.justification}</p>
                      <ul aria-label="Trechos citados" className="list-disc space-y-1 pl-5">
                        {point.excerpts.map((excerpt, index) => (
                          <li key={index}>
                            <q>{excerpt}</q>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>{NOT_EVALUATED}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm">{NOTICE[state.state]}</p>
        )}
      </section>
    </Card>
  );
}
