import { HrefSchema, MARKS, type Inline, type RichText } from '@orakel/content-model/v1';

// Conversão de ida e volta entre o JSON do TipTap e o rich text do content-model, sem DOM.
// Na volta, normaliza: funde trechos vizinhos iguais, põe as marcas na ordem de MARKS,
// agrupa textos com o mesmo link num nó `link` (no TipTap, link é marca), descarta
// parágrafos vazios e tira o link cujo href não passa no HrefSchema (o texto fica).

type Mark = (typeof MARKS)[number];

export type TipTapMark = { type: string; attrs?: Record<string, unknown> };
export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
};

// --- content-model → TipTap -------------------------------------------------------

function textNode(text: string, marks: readonly Mark[] | undefined, href?: string): TipTapNode {
  const all: TipTapMark[] = (marks ?? []).map((mark) => ({ type: mark }));
  if (href !== undefined) all.push({ type: 'link', attrs: { href } });
  return all.length > 0 ? { type: 'text', text, marks: all } : { type: 'text', text };
}

export function inlinesToTipTap(inlines: readonly Inline[]): TipTapNode[] {
  return inlines.flatMap((inline) =>
    inline.type === 'text'
      ? [textNode(inline.text, inline.marks)]
      : inline.children.map((child) => textNode(child.text, child.marks, inline.href)),
  );
}

const paragraph = (inlines: readonly Inline[]): TipTapNode => {
  const content = inlinesToTipTap(inlines);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
};

export function richTextToTipTap(value: RichText): TipTapNode {
  return {
    type: 'doc',
    content: value.map((node): TipTapNode => {
      switch (node.type) {
        case 'paragraph':
          return paragraph(node.children);
        case 'heading':
          return {
            type: 'heading',
            attrs: { level: node.level },
            content: inlinesToTipTap(node.children),
          };
        case 'list':
          return {
            type: node.ordered ? 'orderedList' : 'bulletList',
            content: node.items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
          };
      }
    }),
  };
}

/** Documento de um parágrafo só (modo `inlines`). */
export function inlinesDocToTipTap(value: readonly Inline[]): TipTapNode {
  return { type: 'doc', content: [paragraph(value)] };
}

// --- TipTap → content-model ---------------------------------------------------------

type Run = { text: string; marks: Mark[]; href: string | undefined };

function runOf(node: TipTapNode): Run | undefined {
  if (node.type !== 'text' || !node.text) return undefined;
  const types = (node.marks ?? []).map((mark) => mark.type);
  const marks = MARKS.filter((mark) => types.includes(mark));
  const link = node.marks?.find((mark) => mark.type === 'link');
  const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : undefined;
  return {
    text: node.text,
    marks,
    href: href && HrefSchema.safeParse(href).success ? href : undefined,
  };
}

const sameStyle = (a: Run, b: Run) =>
  a.href === b.href &&
  a.marks.length === b.marks.length &&
  a.marks.every((m, i) => m === b.marks[i]);

const toText = (run: Run) => ({
  type: 'text' as const,
  text: run.text,
  ...(run.marks.length > 0 ? { marks: [...run.marks] } : {}),
});

export function inlinesFromTipTap(nodes: readonly TipTapNode[] | undefined): Inline[] {
  const runs: Run[] = [];
  for (const node of nodes ?? []) {
    const run = runOf(node);
    if (!run) continue;
    const last = runs.at(-1);
    if (last && sameStyle(last, run)) last.text += run.text;
    else runs.push({ ...run });
  }
  const inlines: Inline[] = [];
  for (const run of runs) {
    const last = inlines.at(-1);
    if (run.href === undefined) inlines.push(toText(run));
    else if (last?.type === 'link' && last.href === run.href) last.children.push(toText(run));
    else inlines.push({ type: 'link', href: run.href, children: [toText(run)] });
  }
  return inlines;
}

/** Inlines de um item de lista ou de vários parágrafos (o que o modo `inlines` aceita). */
function inlinesOfBlocks(nodes: readonly TipTapNode[] | undefined): Inline[] {
  return inlinesFromTipTap(
    (nodes ?? []).flatMap((node) =>
      node.type === 'paragraph' || node.type === 'heading' ? (node.content ?? []) : [],
    ),
  );
}

export function richTextFromTipTap(doc: TipTapNode): RichText {
  const nodes: RichText = [];
  for (const node of doc.content ?? []) {
    if (node.type === 'paragraph') {
      const children = inlinesFromTipTap(node.content);
      if (children.length > 0) nodes.push({ type: 'paragraph', children });
    } else if (node.type === 'heading') {
      const children = inlinesFromTipTap(node.content);
      const level = node.attrs?.level === 3 ? 3 : 2;
      if (children.length > 0) nodes.push({ type: 'heading', level, children });
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = (node.content ?? [])
        .map((item) => inlinesOfBlocks(item.content))
        .filter((item) => item.length > 0);
      if (items.length > 0) {
        nodes.push({
          type: 'list',
          ordered: node.type === 'orderedList',
          items,
        });
      }
    }
  }
  return nodes;
}

/** Modo `inlines`: todo o texto do documento numa sequência só. */
export function inlinesDocFromTipTap(doc: TipTapNode): Inline[] {
  return inlinesFromTipTap(
    (doc.content ?? []).flatMap((node) =>
      node.type === 'bulletList' || node.type === 'orderedList'
        ? (node.content ?? []).flatMap((item) => item.content ?? []).flatMap((p) => p.content ?? [])
        : (node.content ?? []),
    ),
  );
}
