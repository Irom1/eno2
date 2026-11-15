import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENO_INTRO } from './intro';
import { readAloud, stopReadAloud, supportsReadAloud } from './readAloud';

const createdSources: FakeSource[] = [];
let decodeSpy: ReturnType<typeof vi.fn>;

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  state = 'running';
  destination = {};
  resume = vi.fn(async () => undefined);
  decodeAudioData = (...args: unknown[]) => decodeSpy(...args);
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    createdSources.push(source);
    return source;
  });
}

beforeEach(() => {
  createdSources.length = 0;
  decodeSpy = vi.fn(async () => ({ duration: 1 }));
  vi.stubGlobal('window', {
    fetch: vi.fn(),
    AudioContext: FakeAudioContext
  });
});

afterEach(() => {
  stopReadAloud();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readAloud', () => {
  it('reports support when fetch and AudioContext exist', () => {
    expect(supportsReadAloud()).toBe(true);
  });

  it('posts text, decodes audio, and starts playback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );
    const onEnd = vi.fn();
    await readAloud('  Hello there.  ', vi.fn(), onEnd);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/tts');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Hello there.' });
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledTimes(1);

    expect(onEnd).not.toHaveBeenCalled();
    createdSources[0].onended?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('plays the pre-recorded intro without calling /api/tts', async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const reportError = vi.fn();

    await readAloud(ENO_INTRO, reportError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/audio/eno-intro.mp3');
    expect(fetchMock.mock.calls.some(([called]) => called === '/api/tts')).toBe(false);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledTimes(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('falls back to /api/tts when the static intro is missing', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/audio/eno-intro.mp3'
        ? new Response('not found', { status: 404 })
        : new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await readAloud(ENO_INTRO, vi.fn());

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/audio/eno-intro.mp3',
      '/api/tts'
    ]);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight request and never plays after stop', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const reportError = vi.fn();
    const pending = readAloud('Hello', reportError);
    const signal = (vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1].signal;

    stopReadAloud();
    expect(signal?.aborted).toBe(true);

    resolveFetch(new Response(new Uint8Array([1]), { status: 200 }));
    await pending;
    expect(createdSources).toHaveLength(0);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('maps an over-long message to a 413 notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 413 })));
    const reportError = vi.fn();
    await readAloud('Hello', reportError);
    expect(reportError).toHaveBeenCalledWith('That message is too long to read aloud.');
    expect(createdSources).toHaveLength(0);
  });

  it('maps a busy voice to a 429 notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    const reportError = vi.fn();
    await readAloud('Hello', reportError);
    expect(reportError).toHaveBeenCalledWith('Voice is busy right now. Try again in a moment.');
  });

  it('reports a generic notice when playback cannot start', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const reportError = vi.fn();
    await readAloud('Hello', reportError);
    expect(reportError).toHaveBeenCalledWith('Voice couldn’t start. You can keep chatting here.');
  });
});
