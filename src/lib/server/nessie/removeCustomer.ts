import { DELETED_CUSTOMER_PREFIX, customerFirstName, isProtectedCustomer, isRemovedCustomer, originalFirstName } from '../../customerDeletion';
import type { RuntimeEnv } from '../env';
import { NessieClient, NessieError, type FetchLike } from './client';

export class CustomerRemovalError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Nessie has no customer DELETE. A reversible, persisted name marker removes
 * the profile from this demo while retaining its original name and records. */
export async function setCustomerRemoved(customerId: string, removed: boolean, runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>, fetchImpl: FetchLike = fetch): Promise<void> {
  const reader = new NessieClient({ apiKey: runtime.NESSIE_API_KEY, baseUrl: runtime.NESSIE_BASE_URL, fetchImpl });
  const path = `/customers/${encodeURIComponent(customerId)}`;
  let customer: Record<string, unknown>;
  try { customer = await reader.get(path); }
  catch (error) { throw new CustomerRemovalError(error instanceof NessieError && error.status === 404 ? 'Account not found.' : 'Couldn’t load this account. Please try again.', error instanceof NessieError && error.status === 404 ? 404 : 502); }
  if (!customer || customer._id !== customerId) throw new CustomerRemovalError('Account not found.', 404);
  if (removed && isProtectedCustomer(customer)) throw new CustomerRemovalError('Maya Chen and Demo Tester cannot be deleted.', 403);
  if (isRemovedCustomer(customer) === removed) return;
  const firstName = customerFirstName(customer);
  if (!firstName.trim()) throw new CustomerRemovalError('This account’s name is missing.', 422);
  const targetName = removed ? DELETED_CUSTOMER_PREFIX + firstName : originalFirstName(firstName);
  const url = new URL(path, runtime.NESSIE_BASE_URL);
  url.searchParams.set('key', runtime.NESSIE_API_KEY);
  try {
    const response = await fetchImpl(url, { method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ first_name: targetName }), signal: AbortSignal.timeout(15_000), redirect: 'manual' });
    const ok = response.ok;
    await response.body?.cancel();
    if (!ok) throw new Error('Update failed');
    const saved = await reader.get<Record<string, unknown>>(path);
    if (customerFirstName(saved) !== targetName) throw new Error('Update not confirmed');
  } catch { throw new CustomerRemovalError('Couldn’t confirm the change. Refresh the account list before trying again.', 502); }
}
