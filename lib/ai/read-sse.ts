/** Read SSE data events across arbitrary UTF-8 and line boundaries. */
export async function* readSseData(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lines: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.search(/[\r\n]/)) !== -1) {
        const delimiter = buffer[end];
        if (!done && delimiter === '\r' && end === buffer.length - 1) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + (delimiter === '\r' && buffer[end + 1] === '\n' ? 2 : 1));

        if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
        else if (line === '' && lines.length) {
          const data = lines.join('\n');
          lines = [];
          yield data;
        }
      }
      if (done) return;
    }
  } finally {
    try { await reader.cancel(); } catch { /* The request may already be closed. */ }
    reader.releaseLock();
  }
}
