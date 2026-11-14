/** Incremental SSE parser for fetch streaming. Tolerates CRLF, comments and split chunks. */

export interface ParsedSseEvent {
  event: string;
  data: string;
}

export interface SseParser {
  push(chunk: string): void;
  flush(): void;
}

function dispatch(block: string, onEvent: (event: ParsedSseEvent) => void): void {
  if (!block.trim()) return;

  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  if (data.length > 0) onEvent({ event, data: data.join("\n") });
}

export function createSseParser(onEvent: (event: ParsedSseEvent) => void): SseParser {
  let buffer = "";

  const drain = (): void => {
    for (;;) {
      const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
      if (!match || match.index === undefined) break;
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      dispatch(block, onEvent);
    }
  };

  return {
    push(chunk: string): void {
      if (!chunk) return;
      buffer += chunk;
      drain();
    },
    flush(): void {
      if (buffer.trim()) {
        dispatch(buffer, onEvent);
        buffer = "";
      }
    }
  };
}

/** Convenience helper for tests and one-shot parsing. */
export function parseSseChunk(raw: string): ParsedSseEvent[] {
  const events: ParsedSseEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  parser.push(raw);
  parser.flush();
  return events;
}
