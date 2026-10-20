import Link from 'next/link';
import type { ReactNode } from 'react';

import type { TrailItem } from './trail.ts';

/**
 * Trilha de navegação acima do título: links até a tela atual, que leva `aria-current`. O Ecme
 * não tem breadcrumb (#243): os links usam a cor dos títulos do template (`.heading-text`), e o
 * item atual e o separador, a do texto do body (com a substituição do docs/migration/ecme.md).
 * Nas listas no padrão do template, fica sozinha acima do cartão (#362).
 */
export function PageTrail({ items }: { items: readonly TrailItem[] }) {
  return (
    <nav aria-label="Trilha de navegação">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">›</span>}
            {item.href === undefined ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="font-semibold text-gray-900 underline underline-offset-4 hover:text-primary dark:text-gray-100"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Cabeçalho da tela (#87): trilha (#173, #174), título à esquerda e a ação principal à
 * direita. A página só passa `action` quando quem pede tem permissão para ela. O Ecme não tem
 * cabeçalho de página (#247): o título usa o do template (h3 `text-2xl` e `.heading-text`), e
 * as ações, o `ui/Button`.
 */
export function PageHeader({
  id,
  trail,
  title,
  action,
}: {
  id: string;
  /** Caminho até a tela, do mais geral ao atual (`siteTrail`). */
  trail?: readonly TrailItem[];
  title: ReactNode;
  /** Ação principal (e as secundárias, agrupadas): link de criar, de cadastrar. */
  action?: ReactNode;
}) {
  const heading = (
    <h1 id={id} className="text-2xl font-bold text-gray-900 dark:text-gray-100">
      {title}
    </h1>
  );
  return (
    <>
      {trail && <PageTrail items={trail} />}
      {action ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          {heading}
          <div className="flex flex-wrap items-center gap-2">{action}</div>
        </div>
      ) : (
        heading
      )}
    </>
  );
}

/**
 * Cabeçalho de uma lista no padrão do template (`CustomerList` do Ecme, #362): o título da tela
 * e a ação principal, dentro do cartão, em coluna abaixo de `md` e em linha a partir dele. A
 * trilha fica acima do cartão (`PageTrail`).
 */
export function ListHeader({
  id,
  title,
  action,
}: {
  id: string;
  title: ReactNode;
  /** Ação principal (criar), só com permissão. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <h1 id={id} className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
