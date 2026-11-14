import type { CustomerCreate } from '$lib/signup';
import type { RuntimeEnv } from '../env';
import { NessieClient, type FetchLike } from './client';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

export class CustomerCreationError extends Error {
  constructor(message: string, readonly status = 502, readonly mayBeCreated = false) { super(message); }
}

function matchesCustomer(value: unknown, input: CustomerCreate): boolean {
  const customer = record(value);
  const address = record(customer.address);
  return customer.first_name === input.first_name && customer.last_name === input.last_name &&
    Object.entries(input.address).every(([key, value]) => address[key] === value);
}

/** This dedicated signup operation is separate from the chat agent’s read-only tools. */
export async function createNessieCustomer(
  input: CustomerCreate,
  runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>,
  fetchImpl: FetchLike = fetch
): Promise<{ customerId: string | null }> {
  if (!runtime.NESSIE_API_KEY.trim()) throw new CustomerCreationError('Sign-up isn’t available just yet. Please try again a little later.', 503);
  const reader = new NessieClient({ apiKey: runtime.NESSIE_API_KEY, baseUrl: runtime.NESSIE_BASE_URL, fetchImpl });
  // Some Nessie versions return only “Customer created”. A before/after ID
  // comparison lets us find the new profile without mistaking an older namesake.
  let existing: unknown;
  try { existing = await reader.get('/customers'); }
  catch { throw new CustomerCreationError('I couldn’t reach sign-up just now. Your answers are still here — try again.'); }
  if (!Array.isArray(existing)) throw new CustomerCreationError('I couldn’t check the customer list. Let’s try that again.');
  const previousIds = new Set(existing.map((item) => String(record(item)._id ?? '')));
  const url = new URL('/customers', runtime.NESSIE_BASE_URL);
  url.searchParams.set('key', runtime.NESSIE_API_KEY);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input), redirect: 'error', signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new CustomerCreationError('I couldn’t confirm whether your profile was created. Head back to Sign in and check for your name before starting again.', 502, true);
  }
  if (!response.ok) {
    throw new CustomerCreationError(
      response.status === 400 ? 'Something in the address didn’t go through. Give it a quick check and try again.' : 'Sign-up hit a little bump. Your answers are still here — please try again.',
      response.status === 400 ? 400 : 502,
      response.status >= 500
    );
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  const body = record(payload);
  const created = record(body.objectCreated);
  const id = created._id ?? body._id;
  if (typeof id === 'string' && id.trim()) return { customerId: id };
  try {
    const customers = await reader.get<unknown>('/customers');
    const matches = Array.isArray(customers) ? customers.filter((item) => {
      const id = record(item)._id;
      return typeof id === 'string' && !previousIds.has(id) && matchesCustomer(item, input);
    }) : [];
    if (matches.length === 1) return { customerId: String(record(matches[0])._id) };
  } catch { /* The creation succeeded; avoid suggesting another creation attempt. */ }
  return { customerId: null };
}
