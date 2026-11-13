import { MockLanguageModelV4 } from 'ai/test';

// Modo `fixture` (R7): o mock model do AI SDK no lugar do provedor, sem rede e determinístico.
// Responde a partir do tema do prompt e escolhe a primeira categoria do enum do schema recebido
// (sem categoria quando o schema não tem o campo); o tema FIXTURE_INVALID_TOPIC aciona a saída
// inválida.

/** Tema que faz o fixture responder fora do schema (sem blocos): o caminho de falha. */
export const FIXTURE_INVALID_TOPIC = 'fixture-saida-invalida';

/** Tokens fixos de cada chamada do fixture, para o custo ser reproduzível nos testes. */
export const FIXTURE_USAGE = { inputTokens: 1_000, outputTokens: 500 } as const;

type CallOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];
type Prompt = CallOptions['prompt'];

function userText(prompt: Prompt): string {
  return prompt
    .flatMap((message) => (message.role === 'user' ? message.content : []))
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Os slugs do enum `categories` do schema enviado; vazio quando o campo não existe. */
function schemaCategories(responseFormat: CallOptions['responseFormat']): string[] {
  if (responseFormat?.type !== 'json') return [];
  const schema = responseFormat.schema as
    { properties?: { categories?: { items?: { enum?: unknown[] } } } } | undefined;
  const values = schema?.properties?.categories?.items?.enum ?? [];
  return values.filter((value): value is string => typeof value === 'string');
}

/**
 * O artigo que o fixture devolve para um tema: um bloco de texto com intertítulo e parágrafo,
 * SEO dentro dos limites e a primeira das `categories` (o campo fica fora sem categorias).
 */
export function fixtureArticle(topic: string, categories: readonly string[] = []): unknown {
  if (topic === FIXTURE_INVALID_TOPIC) {
    return { title: `Artigo de teste: ${topic}`, slug: slugify(topic), blocks: [] };
  }
  return {
    title: `Artigo de teste: ${topic}`,
    slug: slugify(topic) || 'artigo-de-teste',
    description: `Artigo gerado sem LLM sobre ${topic}.`,
    seo: { title: 'Artigo de teste', description: 'Artigo de teste gerado no modo fixture.' },
    ...(categories[0] === undefined ? {} : { categories: [categories[0]] }),
    blocks: [
      {
        type: 'text',
        content: [
          { type: 'heading', level: 2, children: [{ type: 'text', text: topic }] },
          {
            type: 'paragraph',
            children: [{ type: 'text', text: `Texto de teste do modo fixture sobre ${topic}.` }],
          },
        ],
      },
    ],
  };
}

export function fixtureModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: 'fixture',
    modelId: 'fixture',
    doGenerate: ({ prompt, responseFormat }) => {
      const topic = /^Tema: (.*)$/m.exec(userText(prompt))?.[1]?.trim() ?? '';
      const article = fixtureArticle(topic, schemaCategories(responseFormat));
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(article) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: FIXTURE_USAGE.inputTokens,
            noCache: FIXTURE_USAGE.inputTokens,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: FIXTURE_USAGE.outputTokens,
            text: FIXTURE_USAGE.outputTokens,
            reasoning: undefined,
          },
        },
        warnings: [],
      });
    },
  });
}
