// Resumo de um bloco recolhido no editor (#135): o texto que identifica o bloco, por tipo,
// cortado nas primeiras palavras. Função pura sobre o valor do formulário (pode estar
// incompleto ou inválido enquanto se edita).

/** Quantas palavras o resumo mostra. */
export const SUMMARY_WORDS = 12;

export const EMPTY_SUMMARY = '(vazio)';

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Texto dos nós `text` de uma árvore de rich text ou de inlines (parágrafos, listas, links). */
export function treeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(treeText).filter(Boolean).join(' ');
  if (!isRecord(value)) return '';
  if (value.type === 'text' && typeof value.text === 'string') return value.text;
  return [treeText(value.children), treeText(value.items)].filter(Boolean).join(' ');
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Texto completo que identifica o bloco, sem cortar (vai no `title`). */
export function blockText(block: unknown): string {
  if (!isRecord(block)) return '';
  switch (block.type) {
    case 'text':
      return treeText(block.content);
    case 'quote': {
      const quote = treeText(block.content);
      const attribution = str(block.attribution);
      return attribution ? `${quote} — ${attribution}`.trim() : quote;
    }
    case 'toc':
      return str(block.title);
    case 'image':
      return (
        str(block.alt) ||
        treeText(block.caption) ||
        (block.decorative === true ? 'Imagem decorativa' : '')
      );
    case 'faq': {
      const items = Array.isArray(block.items) ? block.items : [];
      return str(isRecord(items[0]) ? items[0].question : '');
    }
    default:
      return '';
  }
}

/** Resumo de uma linha: as primeiras palavras, com reticências quando corta. */
export function blockSummary(block: unknown): string {
  const words = blockText(block).split(/\s+/).filter(Boolean);
  if (words.length === 0) return EMPTY_SUMMARY;
  const head = words.slice(0, SUMMARY_WORDS).join(' ');
  return words.length > SUMMARY_WORDS ? `${head}…` : head;
}
