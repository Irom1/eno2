import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { POST } from './+server';

vi.mock('$lib/server/env', () => ({ resolveEnv: vi.fn() }));

const KEY = 'test-elevenlabs-key';
const VOICE = 'pNInz6obpgDQGcFmaJgB';
const MODEL = 'eleven_turbo_v2_5';

function runtime(overrides: Record<string, string> = {}) {
  return {
    NESSIE_API_KEY: '',
    NESSIE_BASE_URL: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    LLM: 'mock',
    ELEVENLABS_API_KEY: KEY,
    ELEVENLABS_VOICE_ID: VOICE,
    ELEVENLABS_MODEL: MODEL,
    ...overrides
  };
}

function event(body: unknown, signal?: AbortSignal): RequestEvent {
  return {
    request: new Request('http://localhost/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
  } as unknown as RequestEvent;
}

function audioResponse() {
  return new Response(new TextEncoder().encode('ID3 fake audio bytes'), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' }
  });
}

beforeEach(() => {
  vi.mocked(resolveEnv).mockReturnValue(runtime() as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/tts', () => {
  it('streams ElevenLabs audio with the expected upstream request', async () => {
    const upstream = vi.fn(async () => audioResponse());
    vi.stubGlobal('fetch', upstream);

    const response = await POST(event({ text: 'Hello from Eno.' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toContain('ID3');

    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'xi-api-key': KEY,
      'content-type': 'application/json',
      accept: 'audio/mpeg'
    });
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Hello from Eno.', model_id: MODEL });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns 503 when the key is not configured', async () => {
    vi.mocked(resolveEnv).mockReturnValue(runtime({ ELEVENLABS_API_KEY: '' }) as never);
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await POST(event({ text: 'Hello' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Voice is not configured' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns 400 for missing, empty, or invalid text', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await POST(event({ text: '   ' }))).status).toBe(400);
    expect((await POST(event({}))).status).toBe(400);
    expect((await POST(event({ text: 42 }))).status).toBe(400);

    const invalid = {
      request: new Request('http://localhost/api/tts', { method: 'POST', body: 'not json' })
    } as unknown as RequestEvent;
    expect((await POST(invalid)).status).toBe(400);
  });

  it('returns 413 for text over 2500 characters', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const response = await POST(event({ text: 'a'.repeat(2501) }));
    expect(response.status).toBe(413);
  });

  it('maps an upstream 429 to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
    const response = await POST(event({ text: 'Hello' }));
    expect(response.status).toBe(429);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: 'Voice is busy right now' });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('rate limited');
  });

  it('returns 502 on upstream failure without leaking details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('provider exploded with ' + KEY, { status: 500 }))
    );
    const response = await POST(event({ text: 'Hello' }));
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('provider exploded');
  });

  it('returns 502 when the network request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const response = await POST(event({ text: 'Hello' }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('offline');
  });

  it('never includes the key in a successful client-visible response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()));
    const response = await POST(event({ text: 'Hello' }));
    const bytes = new TextDecoder().decode(await response.arrayBuffer());
    expect(bytes).not.toContain(KEY);
  });
});
