import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from './env';
import { generateGemini, streamGemini } from './gemini';

const runtime: RuntimeEnv = {
  NESSIE_API_KEY: 'test-nessie',
  NESSIE_BASE_URL: 'https://prod-api.nessieisreal.com',
  GEMINI_API_KEY: 'test-key-secret-123',
  GEMINI_MODEL: 'gemini-3.8-flash',
  LLM: 'gemini'
};

const params = {
  contents: [{ role: 'user' as const, parts: [{ text: 'Hi' }] }],
  systemInstruction: 'Be brief.',
  declarations: []
};

function bodyOf(call: unknown): Record<string, unknown> {
  return JSON.parse(String((call as [string, RequestInit])[1].body)) as Record<string, unknown>;
}

function generationConfigOf(call: unknown): Record<string, unknown> {
  return bodyOf(call).generationConfig as Record<string, unknown>;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

const okPayload = {
  candidates: [{ content: { role: 'model', parts: [{ text: 'Here you go.' }] } }],
  usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3, totalTokenCount: 7 }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gemini thinking config', () => {
  it('asks for a zero thinking budget on the streaming request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Hi there"}]}}]}\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const result = await streamGemini(runtime, {
      ...params,
      onText: (delta) => deltas.push(delta)
    });

    expect(result.text).toBe('Hi there');
    expect(deltas).toEqual(['Hi there']);
    expect(generationConfigOf(fetchMock.mock.calls[0])).toMatchObject({
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0.35,
      maxOutputTokens: 2048
    });
  });

  it('retries once without the thinking config when the provider rejects it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Thinking config is not supported by this model.' } }, 400)
      )
      .mockResolvedValueOnce(jsonResponse(okPayload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateGemini(runtime, params);

    expect(result.text).toBe('Here you go.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(generationConfigOf(fetchMock.mock.calls[0])).toHaveProperty('thinkingConfig');
    expect(generationConfigOf(fetchMock.mock.calls[1])).not.toHaveProperty('thinkingConfig');
  });

  it('does not retry unrelated 400s and never leaks the API key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: 'Invalid tool schema.' } }, 400)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateGemini(runtime, params)).rejects.toThrow(/Invalid tool schema/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const error = await generateGemini(runtime, params).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('test-key-secret-123');
  });
});
