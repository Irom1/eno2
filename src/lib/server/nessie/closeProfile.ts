import type { RuntimeEnv } from '../env';

const CLOSED_FIRST_NAME = 'Closed';
const CLOSED_LAST_NAME = 'Eno Demo Profile';
const CLOSED_ZIP = '00000';

export function isClosedProfile(customer: { firstName?: string; lastName?: string; address?: { zip?: unknown } }): boolean {
  return customer.firstName === CLOSED_FIRST_NAME &&
    customer.lastName === CLOSED_LAST_NAME &&
    customer.address?.zip === CLOSED_ZIP;
}

/** Nessie has no customer DELETE operation. Replace identifying fields after deleting the accounts. */
export async function closeNessieProfile(customerId: string, runtime: RuntimeEnv): Promise<void> {
  if (!runtime.NESSIE_API_KEY || !/^[a-zA-Z0-9_-]+$/.test(customerId)) {
    throw new Error('Invalid Nessie configuration or customer id');
  }

  function endpoint(path: string): URL {
    const url = new URL(path, runtime.NESSIE_BASE_URL);
    url.searchParams.set('key', runtime.NESSIE_API_KEY);
    return url;
  }

  const options = { redirect: 'manual' as const, signal: AbortSignal.timeout(12_000) };
  const customerPath = `/customers/${customerId}`;
  const list = await fetch(endpoint(`${customerPath}/accounts`), options);
  if (!list.ok) throw new Error('Could not list accounts');
  const accounts: unknown = await list.json();
  if (!Array.isArray(accounts) || accounts.some((account) =>
    typeof account?._id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(account._id)
  )) {
    throw new Error('Invalid account list');
  }

  // A retry starts with a fresh list, so it can finish after a partial closure.
  const results = await Promise.allSettled(accounts.map(async (account) => {
    const response = await fetch(endpoint(`/accounts/${account._id}`), { ...options, method: 'DELETE' });
    await response.body?.cancel();
    if (!response.ok && response.status !== 404) throw new Error('Could not delete account');
  }));
  if (results.some((result) => result.status === 'rejected')) throw new Error('Could not delete all accounts');

  const address = {
    street_number: '0',
    street_name: 'Closed Profile',
    city: 'Washington',
    state: 'DC',
    zip: CLOSED_ZIP
  };
  const customer = endpoint(customerPath);
  const update = await fetch(customer, {
    ...options,
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ first_name: CLOSED_FIRST_NAME, last_name: CLOSED_LAST_NAME, address })
  });
  await update.body?.cancel();
  if (!update.ok) throw new Error('Could not close profile');

  const verification = await fetch(customer, options);
  if (!verification.ok) throw new Error('Could not verify closure');
  const saved = await verification.json() as {
    first_name?: string;
    last_name?: string;
    address?: Record<string, unknown>;
  };
  if (
    !isClosedProfile({ firstName: saved.first_name, lastName: saved.last_name, address: saved.address }) ||
    !Object.entries(address).every(([key, value]) => saved.address?.[key] === value)
  ) {
    throw new Error('Could not verify closure');
  }
}
