/**
 * Client-side session recovery.
 *
 * The browser keeps the session id in an httpOnly cookie. If the server forgets
 * that id (isolate eviction, dev-server restart, expiry), every session-backed
 * endpoint answers 401 while the browser still looks "logged in". This module
 * detects that case, re-creates the session from the customer id, and retries
 * the original request exactly once.
 *
 * Client-only: never import this from server code.
 */

import { savedCustomerId } from '$lib/customerSelection';

/** One shared recovery per customer so N parallel 401s produce one POST. */
const inFlight = new Map<string, Promise<boolean>>();

const isBrowser = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.location !== 'undefined';
  } catch {
    return false;
  }
};

const resolveCustomer = (customerId?: string): string => {
  const provided = typeof customerId === 'string' ? customerId.trim() : '';
  return provided || activeCustomerId();
};

/** URL `?customer=` wins, then the remembered selection, then unknown. */
export function activeCustomerId(): string {
  if (!isBrowser()) return '';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('customer');
    if (fromUrl) return fromUrl;
  } catch {
    // A malformed location must not break a request.
  }
  try {
    return savedCustomerId() || '';
  } catch {
    return '';
  }
}

function inputUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  return typeof input === 'object' && input !== null && 'url' in input
    ? String((input as Request).url)
    : String(input);
}

function isSessionEndpoint(input: RequestInfo | URL): boolean {
  try {
    const base = isBrowser() ? window.location.origin : 'http://localhost';
    return new URL(inputUrl(input), base).pathname === '/api/session';
  } catch {
    return false;
  }
}

function replayableInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.clone();
  return input;
}

/**
 * Create a fresh server session for the customer. Uses a raw `fetch` so this
 * wrapper never calls itself. Resolves `false` when no customer is known or the
 * server refuses; never throws.
 */
export async function recoverSession(customerId?: string): Promise<boolean> {
  const customer = resolveCustomer(customerId);
  if (!customer) return false;

  const existing = inFlight.get(customer);
  if (existing) return existing;

  const task = (async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: customer })
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      inFlight.delete(customer);
    }
  })();

  inFlight.set(customer, task);
  return task;
}

/**
 * `fetch` for session-backed endpoints. A 401 (or a dropped connection) triggers
 * one recovery + retry when a customer id is available. Other errors pass
 * through untouched, and `/api/session` itself is never retried.
 */
export async function fetchWithSession(
  input: RequestInfo | URL,
  init?: RequestInit,
  customerId?: string
): Promise<Response> {
  const canRecover = !isSessionEndpoint(input);
  const retryInput = canRecover ? replayableInput(input) : input;

  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (!canRecover) throw error;
    const customer = resolveCustomer(customerId);
    if (!customer || !(await recoverSession(customer))) throw error;
    return fetch(retryInput, init);
  }

  if (!canRecover || response.status !== 401) return response;

  const customer = resolveCustomer(customerId);
  if (!customer || !(await recoverSession(customer))) return response;
  return fetch(retryInput, init);
}
