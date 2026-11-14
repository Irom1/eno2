import { describe, expect, it } from "vitest";
import { createSseParser, parseSseChunk } from "./sse";

describe("createSseParser", () => {
  it("parses multiple events in one chunk", () => {
    const raw = 'event: text\ndata: {"delta":"a"}\n\nevent: done\ndata: {"ok":true}\n\n';
    expect(parseSseChunk(raw)).toEqual([
      { event: "text", data: '{"delta":"a"}' },
      { event: "done", data: '{"ok":true}' }
    ]);
  });

  it("handles CRLF frames and comments", () => {
    const raw = ': keep-alive\r\nevent: notice\r\ndata: {"reason":"credits"}\r\n\r\n';
    expect(parseSseChunk(raw)).toEqual([{ event: "notice", data: '{"reason":"credits"}' }]);
  });

  it("reassembles events split across chunks", () => {
    const events: Array<{ event: string; data: string }> = [];
    const parser = createSseParser((event) => events.push(event));
    parser.push('event: text\ndata: {"delta":"hel');
    expect(events).toHaveLength(0);
    parser.push('lo"}\n\nevent: done\ndata: {"sessionId":"s1"}\n');
    parser.push("\n");
    expect(events).toEqual([
      { event: "text", data: '{"delta":"hello"}' },
      { event: "done", data: '{"sessionId":"s1"}' }
    ]);
  });

  it("joins multiple data lines and flushes a trailing frame", () => {
    const events: Array<{ event: string; data: string }> = [];
    const parser = createSseParser((event) => events.push(event));
    parser.push("event: insight\ndata: line one\ndata: line two");
    parser.flush();
    expect(events).toEqual([{ event: "insight", data: "line one\nline two" }]);
  });
});
