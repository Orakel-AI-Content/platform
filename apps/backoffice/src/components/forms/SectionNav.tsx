'use client';

import { useEffect, useState } from 'react';

import classNames from '@/components/ui/utils/classNames';
import { HEADER_HEIGHT } from '@/components/template/constants';

/** Folga entre o cabeçalho fixo e o índice (e a linha que conta como "seção visível"). */
const OFFSET = HEADER_HEIGHT + 16;

/**
 * Seção visível: a primeira, na ordem do formulário, com alguma parte na faixa entre o
 * cabeçalho fixo e o meio da tela; ou a última, quando ela aparece inteira (no fim da página
 * ela não chega a subir até a faixa). Sem `IntersectionObserver` (ambiente sem layout), fica a
 * primeira seção.
 */
function useActiveSection(ids: readonly string[]): string | undefined {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(' ');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const order = key.split(' ');
    const last = order.at(-1);
    const visible = new Set<string>();
    let lastWhole = false;
    const update = () => {
      const first = lastWhole ? last : order.find((id) => visible.has(id));
      if (first !== undefined) setActive(first);
    };
    const band = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-section') ?? '';
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        update();
      },
      { rootMargin: `-${OFFSET}px 0px -50% 0px` },
    );
    const whole = new IntersectionObserver(
      ([entry]) => {
        lastWhole = entry !== undefined && entry.intersectionRatio >= 1;
        update();
      },
      { rootMargin: `-${OFFSET}px 0px 0px 0px`, threshold: 1 },
    );
    for (const id of order) {
      const section = document.getElementById(`secao-${id}`)?.closest('section');
      if (!section) continue;
      section.setAttribute('data-section', id);
      band.observe(section);
      if (id === last) whole.observe(section);
    }
    return () => {
      band.disconnect();
      whole.disconnect();
    };
  }, [key]);
  return active;
}

/**
 * Índice das seções do formulário de tela (#594): no topo, em linha, abaixo de `xl`; a partir
 * de `xl`, coluna ao lado dos cartões, fixa abaixo do cabeçalho, com a seção visível marcada
 * por `aria-current`. As âncoras continuam `#secao-<id>`.
 */
export function SectionNav({ sections }: { sections: readonly { id: string; title: string }[] }) {
  const active = useActiveSection(sections.map((section) => section.id));
  return (
    <nav
      aria-label="Seções do formulário"
      className="xl:order-last xl:sticky xl:w-44 xl:shrink-0"
      style={{ top: OFFSET }}
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm xl:flex-col xl:flex-nowrap xl:gap-y-2 xl:border-l xl:border-gray-200 xl:pl-4 xl:dark:border-gray-700">
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#secao-${section.id}`}
                aria-current={current ? 'true' : undefined}
                className={classNames(
                  'underline underline-offset-4',
                  current && 'font-semibold text-gray-900 dark:text-gray-100',
                )}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
