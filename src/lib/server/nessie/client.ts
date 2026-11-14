/**
 * Read-only Nessie HTTP client.
 *
 * Design constraints (see plan §4.3):
 *  - Only a single `get(path, params)` operation is exposed.
 *  - No generic request helper and no verb parameter. The only HTTP verb used
 *    by this file is GET.
 *  - The API key never appears in thrown errors or logs.
 */

import { reconcileDemoAccount } from './demoBalances';

const DEFAULT_BASE_URL = "https://prod-api.nessieisreal.com";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60_000;

export type FetchLike = typeof fetch;

export interface NessieClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/** Error raised for any failed Nessie call. Deliberately excludes the API key. */
export class NessieError extends Error {
  readonly path: string;
  readonly status: number | undefined;

  constructor(message: string, path: string, status?: number) {
    super(message);
    this.name = "NessieError";
    this.path = path;
    this.status = status;
  }
}

interface CacheEntry {
  at: number;
  data: unknown;
}

export class NessieClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: NessieClientOptions = {}) {
    // The runtime key is always supplied by the caller (platform env / dev env).
    this.apiKey = options.apiKey ?? "";
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Perform a read-only GET against the Nessie API.
   * Retries exactly once on a 5xx response or a network/timeout failure.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const key = this.apiKey;
    if (!key || !key.trim()) {
      throw new NessieError(
        "NESSIE_API_KEY is not configured; set it in .env or the process environment",
        path,
      );
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        if (value === undefined) continue;
        url.searchParams.set(name, String(value));
      }
    }
    url.searchParams.set("key", key);

    const cacheKey = url.toString();
    // Customer list is intentionally uncached so health checks reflect reality.
    const cacheable = !/^\/customers(?:\/[^/]+)?$/.test(normalizedPath);

    if (cacheable) {
      const hit = this.cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return hit.data as T;
      }
    }

    // Detach fetch from `this`: workerd throws "Illegal invocation" when the
    // global fetch is called as an object method (Node tolerates it).
    const fetchImpl = this.fetchImpl;

    let attempt = 0;
    for (;;) {
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { accept: "application/json" },
        });

        if (response.status >= 500 && attempt === 0) {
          attempt += 1;
          continue;
        }

        const customerBills = normalizedPath.match(/^\/customers\/([^/]+)\/bills$/);
        if (response.status === 400 && customerBills) {
          // Nessie's aggregate bill endpoint can fail while deserializing an
          // unrelated/orphaned bill. Read only the customer's owned accounts;
          // every returned bill still comes from Nessie, never sample UI data.
          const accounts = await this.get<unknown>(`/customers/${customerBills[1]}/accounts`);
          if (!Array.isArray(accounts)) throw new NessieError('Nessie account list is unavailable', normalizedPath);
          const bills = await Promise.all(accounts.map(async (account) => {
            if (!account || typeof account._id !== 'string') throw new NessieError('Nessie account id is unavailable', normalizedPath);
            const rows = await this.get<unknown>(`/accounts/${encodeURIComponent(account._id)}/bills`);
            if (!Array.isArray(rows)) throw new NessieError('Nessie bill list is unavailable', normalizedPath);
            return rows;
          }));
          const data = bills.flat();
          this.cache.set(cacheKey, { at: Date.now(), data });
          return data as T;
        }
        if (!response.ok) {
          throw new NessieError(
            `Nessie request failed with status ${response.status}`,
            normalizedPath,
            response.status,
          );
        }

        let data: unknown = await response.json();
        if (/^\/(?:customers\/[^/]+\/accounts|accounts)$/.test(normalizedPath) && Array.isArray(data)) {
          data = await Promise.all(data.map((account) => reconcileDemoAccount(account, (path) => this.get(path))));
        } else if (/^\/accounts\/[^/]+$/.test(normalizedPath)) {
          data = await reconcileDemoAccount(data, (path) => this.get(path));
        }
        if (cacheable) {
          this.cache.set(cacheKey, { at: Date.now(), data });
        }
        return data as T;
      } catch (error) {
        if (error instanceof NessieError) throw error;
        if (attempt === 0) {
          attempt += 1;
          continue;
        }
        const name = error instanceof Error ? error.name : "UnknownError";
        const reason = name === "TimeoutError" ? "timeout" : "network failure";
        throw new NessieError(`Nessie request failed: ${reason}`, normalizedPath);
      }
    }
  }
}

/** Mask a full account number, keeping only the last four digits. */
export function maskAccountNumber(accountNumber: unknown): string {
  const digits = String(accountNumber ?? "").replace(/\D+/g, "");
  if (!digits) return "\u2022\u2022\u2022\u2022 ????";
  return `\u2022\u2022\u2022\u2022 ${digits.slice(-4)}`;
}
