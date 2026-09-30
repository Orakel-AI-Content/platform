import { describe, expect, it } from 'vitest';

import { ndjsonLines } from './ndjson.ts';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of ndjsonLines(stream)) lines.push(line);
  return lines;
}

describe('ndjsonLines', () => {
  it('junta linhas partidas entre pedaços, inclusive no meio de um caractere', async () => {
    const encoded = new TextEncoder().encode('{"a":"é"}\n{"b":2}\n');
    const cut = 7; // dentro dos bytes de "é"
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.subarray(0, cut));
        controller.enqueue(encoded.subarray(cut));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual(['{"a":"é"}', '{"b":2}']);
  });

  it('aceita CRLF, ignora linhas vazias e lê a última linha sem quebra final', async () => {
    expect(await collect(streamOf('{"a":1}\r\n\r\n{"b', '":2}\n{"c":3}'))).toEqual([
      '{"a":1}',
      '{"b":2}',
      '{"c":3}',
    ]);
  });
});
