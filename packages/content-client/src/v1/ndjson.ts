/**
 * Linhas de um NDJSON em streaming: junta linhas partidas entre pedaços, aceita CRLF e
 * ignora linhas vazias. A última linha pode vir sem quebra final.
 */
export async function* ndjsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = '';
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.trim() !== '') yield line;
      newline = buffer.indexOf('\n');
    }
  }
  const last = buffer.replace(/\r$/, '');
  if (last.trim() !== '') yield last;
}
