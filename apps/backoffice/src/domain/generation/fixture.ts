import { MockLanguageModelV4 } from 'ai/test';

// Modo `fixture` (R7): o mock model do AI SDK no lugar do provedor, sem rede e determinístico.
// Responde a partir do tema do prompt; o tema FIXTURE_INVALID_TOPIC aciona a saída inválida.

/** Tema que faz o fixture responder fora do schema (sem blocos): o caminho de falha. */
export const FIXTURE_INVALID_TOPIC = 'fixture-saida-invalida';

/** Tokens fixos de cada chamada do fixture, para o custo ser reproduzível nos testes. */
export const FIXTURE_USAGE = { inputTokens: 1_000, outputTokens: 500 } as const;

type Prompt = Parameters<MockLanguageModelV4['doGenerate']>[0]['prompt'];

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

/** O artigo que o fixture devolve para um tema: um bloco de texto com intertítulo e parágrafo. */
export function fixtureArticle(topic: string): unknown {
  if (topic === FIXTURE_INVALID_TOPIC) {
    return { title: `Artigo de teste: ${topic}`, slug: slugify(topic), blocks: [] };
  }
  return {
    title: `Artigo de teste: ${topic}`,
    slug: slugify(topic) || 'artigo-de-teste',
    description: `Artigo gerado sem LLM sobre ${topic}.`,
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
    doGenerate: ({ prompt }) => {
      const topic = /^Tema: (.*)$/m.exec(userText(prompt))?.[1]?.trim() ?? '';
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(fixtureArticle(topic)) }],
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
