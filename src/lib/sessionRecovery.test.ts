import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RecoveryModule = typeof import('./sessionRecovery');

const ok = (status = 200): Response => ({ ok: status >= 200 && status < 300, status } as Response);
const reply = (status: number): Response => ({ ok: status >= 200 && status < 300, status } as Response);

let recovery: RecoveryModule;
let localStorageValues: Map<string, string>;

function stubBrowser(search = '?customer=cust-1'): void {
  localStorageValues = new Map();
  vi.stubGlobal('window', { location: { search, origin: 'http://localhost' } });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageValues.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageValues.set(key, value)
  });
}

beforeEach(async () => {
  vi.resetModules();
  stubBrowser();
  recovery = await import('./sessionRecovery');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('activeCustomerId', () => {
  it('prefers the URL, then the saved selection', () => {
    expect(recovery.activeCustomerId()).toBe('cust-1');

    stubBrowser('');
    localStorageValues.set('eno-active-customer', 'cust-saved');
    expect(recovery.activeCustomerId()).toBe('cust-saved');

    localStorageValues.clear();
    expect(recovery.activeCustomerId()).toBe('');
  });

  it('returns empty without a window or a malformed location', () => {
    vi.unstubAllGlobals();
    expect(recovery.activeCustomerId()).toBe('');

    vi.stubGlobal('window', {
      get location(): never {
        throw new Error('blocked');
      }
    });
    expect(recovery.activeCustomerId()).toBe('');
  });
});

describe('recoverSession', () => {
  it('POSTs the customer id and reports success', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    await expect(recovery.recoverSession('cust-1')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/session');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ customerId: 'cust-1' });
  });

  it('falls back to the active customer id', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    await expect(recovery.recoverSession()).resolves.toBe(true);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      customerId: 'cust-1'
    });
  });

  it('returns false on a server refusal, a network error, or no customer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(500)));
    await expect(recovery.recoverSession('cust-1')).resolves.toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(recovery.recoverSession('cust-1')).resolves.toBe(false);

    vi.unstubAllGlobals();
    stubBrowser('');
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    await expect(recovery.recoverSession()).resolves.toBe(false);
  });

  it('deduplicates concurrent recoveries for one customer', async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      recovery.recoverSession('cust-1'),
      recovery.recoverSession('cust-1'),
      recovery.recoverSession('cust-1')
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWithSession', () => {
  it('recovers on 401 and retries the original request once', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === '/api/chat') return calls.filter((c) => c === '/api/chat').length === 1 ? reply(401) : ok();
        return ok();
      })
    );

    const response = await recovery.fetchWithSession('/api/chat', { method: 'POST' }, 'cust-1');
    expect(response.status).toBe(200);
    expect(calls).toEqual(['/api/chat', '/api/session', '/api/chat']);
  });

  it('shares one session POST across concurrent 401s', async () => {
    let chatAttempts = 0;
    let sessionPosts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/session') {
          sessionPosts += 1;
          return ok();
        }
        chatAttempts += 1;
        return chatAttempts <= 3 ? reply(401) : ok();
      })
    );

    const responses = await Promise.all([
      recovery.fetchWithSession('/api/chat', {}, 'cust-1'),
      recovery.fetchWithSession('/api/chat', {}, 'cust-1'),
      recovery.fetchWithSession('/api/chat', {}, 'cust-1')
    ]);
    expect(sessionPosts).toBe(1);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  });

  it('does not recover for non-401 HTTP errors', async () => {
    const fetchMock = vi.fn(async () => reply(500));
    vi.stubGlobal('fetch', fetchMock);

    const response = await recovery.fetchWithSession('/api/chat', {}, 'cust-1');
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the original 401 when no customer is known or recovery fails', async () => {
    stubBrowser('');
    const noCustomerFetch = vi.fn(async () => reply(401));
    vi.stubGlobal('fetch', noCustomerFetch);
    expect((await recovery.fetchWithSession('/api/chat')).status).toBe(401);
    expect(noCustomerFetch).toHaveBeenCalledTimes(1);

    const failedRecoveryFetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/session' ? reply(500) : reply(401)
    );
    vi.stubGlobal('fetch', failedRecoveryFetch);
    expect((await recovery.fetchWithSession('/api/chat', {}, 'cust-1')).status).toBe(401);
    expect(failedRecoveryFetch).toHaveBeenCalledTimes(2);
  });

  it('retries once after a network error when recovery succeeds', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === '/api/session') return ok();
        if (calls.filter((c) => c === '/api/chat').length === 1) throw new TypeError('offline');
        return ok();
      })
    );

    const response = await recovery.fetchWithSession('/api/chat', {}, 'cust-1');
    expect(response.status).toBe(200);
    expect(calls).toEqual(['/api/chat', '/api/session', '/api/chat']);
  });

  it('rethrows the original network error when there is no customer to recover', async () => {
    stubBrowser('');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));

    await expect(recovery.fetchWithSession('/api/chat')).rejects.toThrow('offline');
  });

  it('never retries /api/session itself', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return reply(401);
      })
    );

    const response = await recovery.fetchWithSession('/api/session', { method: 'POST' }, 'cust-1');
    expect(response.status).toBe(401);
    expect(calls).toEqual(['/api/session']);
  });

  it('never replays an uncertain account or card creation request after a network error', async () => {
    const transport = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', transport);
    await expect(recovery.fetchWithSession('/api/accounts/open', { method: 'POST', body: '{}' }, 'cust-1')).rejects.toThrow('offline');
    expect(transport).toHaveBeenCalledOnce();
  });

  it('clones a Request body so it survives the retry', async () => {
    if (typeof Request === 'undefined') return;
    const calls: Array<RequestInfo | URL> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(input);
        if (typeof input !== 'string' && input instanceof Request && input.url.endsWith('/api/chat')) {
          const sent = calls.filter((c) => c instanceof Request && c.url.endsWith('/api/chat')).length;
          return sent === 1 ? reply(401) : ok();
        }
        return ok();
      })
    );

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi' })
    });
    const response = await recovery.fetchWithSession(request, undefined, 'cust-1');
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
  });
});
