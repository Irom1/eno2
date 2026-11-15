/**
 * Short-lived, cross-tab cache for wallet deep links. Transaction cards point at
 * `/dashboard?...&txn=...`, so warming the snapshot and account-detail payloads
 * while the customer reads the chat lets the account view paint immediately.
 *
 * This module is client-only and must not import server code.
 */

import { GUEST_CUSTOMER_ID } from './chat/guest';
import { fetchWithSession } from './sessionRecovery';

export const FRESH_MS = 15_000;
export const STALE_MS = 120_000;

const KEY_PREFIX = 'eno:wallet:cache:v1';

export interface CacheEntry<T> {
  at: number;
  data: T;
}

type CacheStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): CacheStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read a cache entry, returning null when missing, expired, or malformed. */
export function readWalletCache<T>(
  key: string,
  maxAgeMs: number,
  storage?: CacheStorage
): T | null {
  try {
    const store = storage ?? defaultStorage();
    if (!store) return null;
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const entry = parsed as Partial<CacheEntry<T>>;
    if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return null;
    if (!('data' in entry)) return null;
    const age = Date.now() - entry.at;
    if (age < 0 || age > maxAgeMs) return null;
    return entry.data as T;
  } catch {
    return null;
  }
}

/** Write a cache entry; quota or security failures are swallowed. */
export function writeWalletCache<T>(
  key: string,
  data: T,
  storage?: CacheStorage
): void {
  try {
    const store = storage ?? defaultStorage();
    if (!store) return;
    const entry: CacheEntry<T> = { at: Date.now(), data };
    store.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache writes are an optimization only.
  }
}

export const snapshotCacheKey = (customerId: string): string =>
  `${KEY_PREFIX}:snapshot:${customerId}`;

export const accountCacheKey = (accountId: string): string =>
  `${KEY_PREFIX}:account:${accountId}`;

const inFlight = new Map<string, Promise<void>>();

async function fetchJson(url: string, customerId?: string): Promise<unknown> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4_000) : null;
  try {
    const response = await fetchWithSession(url, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {})
    }, customerId);
    if (!response.ok) return null;
    return await response.json();
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function prefetch(
  key: string,
  url: string,
  onData: (data: unknown) => void,
  customerId?: string
): Promise<void> {
  if (inFlight.has(key)) return inFlight.get(key);
  if (readWalletCache(key, FRESH_MS) !== null) return;

  const task = (async () => {
    try {
      const data = await fetchJson(url, customerId);
      if (data === null || data === undefined) return;
      onData(data);
    } catch {
      // Prefetch never affects rendering or streaming.
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
}

const isGuest = (customerId: string): boolean =>
  !customerId || customerId === GUEST_CUSTOMER_ID;

/** Warm the customer snapshot (`GET /api/accounts`) used by the dashboard boot. */
export function prefetchSnapshot(customerId: string): Promise<void> {
  if (isGuest(customerId)) return Promise.resolve();
  const key = snapshotCacheKey(customerId);
  return prefetch(key, '/api/accounts', (data) => writeWalletCache(key, data), customerId);
}

/** Warm one account detail (`GET /api/accounts/{id}`) used by the deep link. */
export function prefetchAccountDetail(accountId: string): Promise<void> {
  if (!accountId) return Promise.resolve();
  const key = accountCacheKey(accountId);
  return prefetch(key, `/api/accounts/${encodeURIComponent(accountId)}`, (data) =>
    writeWalletCache(key, data)
  );
}

/** Warm both payloads a transaction deep link needs. */
export function prefetchTransactionContext(
  customerId: string | undefined,
  accountId: string | undefined
): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  if (customerId) tasks.push(prefetchSnapshot(customerId));
  if (accountId) tasks.push(prefetchAccountDetail(accountId));
  return Promise.all(tasks).then(() => undefined);
}
