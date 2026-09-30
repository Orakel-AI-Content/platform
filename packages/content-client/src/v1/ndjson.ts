/**
 * Linhas de um NDJSON em streaming: junta linhas partidas entre pedaços, aceita CRLF e
 * ignora linhas vazias. A última linha pode vir sem quebra final.
 */
export async function* ndjsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buffer = '';
  // TextDecoder com `stream: true` (e não TextDecoderStream): mesmo resultado, com tipos
  // iguais no DOM e no Node — o pacote compila nos consumidores que usam os dois.
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line.trim() !== '') yield line;
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  const last = buffer.replace(/\r$/, '');
  if (last.trim() !== '') yield last;
}
