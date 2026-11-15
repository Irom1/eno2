import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CacheModule = typeof import('./walletCache');

class FakeStorage {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let storage: FakeStorage;
let cache: CacheModule;

beforeEach(async () => {
  storage = new FakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  vi.resetModules();
  cache = await import('./walletCache');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('wallet cache keys', () => {
  it('namespaces snapshot and account entries', () => {
    expect(cache.snapshotCacheKey('cust-1')).toBe('eno:wallet:cache:v1:snapshot:v2:cust-1');
    expect(cache.accountCacheKey('acct-1')).toBe('eno:wallet:cache:v1:account:acct-1');
  });
});

describe('readWalletCache / writeWalletCache', () => {
  it('round-trips data with a timestamp', () => {
    cache.writeWalletCache('key', { value: 42 }, storage);
    expect(cache.readWalletCache<{ value: number }>('key', cache.FRESH_MS, storage)).toEqual({
      value: 42
    });
  });

  it('returns null once the entry is older than the max age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    cache.writeWalletCache('key', 'old', storage);
    vi.setSystemTime(new Date('2026-11-14T12:00:16Z'));
    expect(cache.readWalletCache('key', cache.FRESH_MS, storage)).toBeNull();
    expect(cache.readWalletCache('key', cache.STALE_MS, storage)).toBe('old');
  });

  it('returns null for missing or malformed entries', () => {
    expect(cache.readWalletCache('missing', cache.FRESH_MS, storage)).toBeNull();
    storage.setItem('bad', '{not json');
    expect(cache.readWalletCache('bad', cache.FRESH_MS, storage)).toBeNull();
    storage.setItem('shape', JSON.stringify({ data: 'no timestamp' }));
    expect(cache.readWalletCache('shape', cache.FRESH_MS, storage)).toBeNull();
    storage.setItem('entry', JSON.stringify({ at: Date.now() }));
    expect(cache.readWalletCache('entry', cache.FRESH_MS, storage)).toBeNull();
  });

  it('swallows storage failures', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      }
    };
    expect(cache.readWalletCache('key', cache.FRESH_MS, broken)).toBeNull();
    expect(() => cache.writeWalletCache('key', 'data', broken)).not.toThrow();
  });

  it('returns null outside the browser without storage', () => {
    vi.unstubAllGlobals();
    expect(cache.readWalletCache('key', cache.FRESH_MS)).toBeNull();
    expect(() => cache.writeWalletCache('key', 'data')).not.toThrow();
  });
});

describe('prefetching', () => {
  function jsonResponse(data: unknown): Response {
    return { ok: true, json: async () => data } as unknown as Response;
  }

  it('prefetches the snapshot from /api/accounts and caches it', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ accounts: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await cache.prefetchSnapshot('cust-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts',
      expect.objectContaining({
        credentials: 'same-origin',
        headers: { accept: 'application/json' }
      })
    );
    expect(cache.readWalletCache(cache.snapshotCacheKey('cust-1'), cache.FRESH_MS)).toEqual({
      accounts: []
    });
  });

  it('prefetches account detail from /api/accounts/{id}', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ account: { id: 'acct-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await cache.prefetchAccountDetail('acct-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts/acct-1',
      expect.objectContaining({ credentials: 'same-origin' })
    );
    expect(cache.readWalletCache(cache.accountCacheKey('acct-1'), cache.FRESH_MS)).toEqual({
      account: { id: 'acct-1' }
    });
  });

  it('prefetches both for a transaction context', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await cache.prefetchTransactionContext('cust-1', 'acct-1');

    const urls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
      .map(([url]) => url)
      .sort();
    expect(urls).toEqual(['/api/accounts', '/api/accounts/acct-1']);
  });

  it('skips guest customers and empty ids', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await cache.prefetchSnapshot('guest');
    await cache.prefetchSnapshot('');
    await cache.prefetchAccountDetail('');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a fresh cached snapshot and account', async () => {
    cache.writeWalletCache(cache.snapshotCacheKey('cust-1'), { cached: true });
    cache.writeWalletCache(cache.accountCacheKey('acct-1'), { cached: true });
    const fetchMock = vi.fn(async () => jsonResponse({ fresh: false }));
    vi.stubGlobal('fetch', fetchMock);

    await cache.prefetchSnapshot('cust-1');
    await cache.prefetchAccountDetail('acct-1');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes concurrent prefetches for the same key', async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);

    const first = cache.prefetchSnapshot('cust-1');
    const second = cache.prefetchSnapshot('cust-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve(jsonResponse({ accounts: [] }));
    await Promise.all([first, second]);
  });

  it('allows a retry after an in-flight prefetch fails', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', failing);
    await expect(cache.prefetchSnapshot('cust-1')).resolves.toBeUndefined();

    const succeeding = vi.fn(async () => jsonResponse({ accounts: [] }));
    vi.stubGlobal('fetch', succeeding);
    await cache.prefetchSnapshot('cust-1');
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it('ignores non-OK responses', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await cache.prefetchSnapshot('cust-1');

    expect(cache.readWalletCache(cache.snapshotCacheKey('cust-1'), cache.FRESH_MS)).toBeNull();
  });
});
