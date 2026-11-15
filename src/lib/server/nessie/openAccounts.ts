import { availableProducts, openingProducts, type AccountProductId } from '../../accountOpening';
import { isRemovedCustomer } from '../../customerDeletion';
import { demoCard, type SpendingCategory } from '../../spending';
import { normalizeAccount, normalizeCustomer } from '../accounts';
import type { RuntimeEnv } from '../env';
import { NessieClient, type FetchLike } from './client';
import { isClosedProfile } from './closeProfile';
import { createNessieAccounts } from './createAccounts';

type Runtime = Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>;
export class AccountOpeningError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function readAccountOpeningState(customerId: string, runtime: Runtime, fetchImpl: FetchLike = fetch) {
  const client = new NessieClient({ apiKey: runtime.NESSIE_API_KEY, baseUrl: runtime.NESSIE_BASE_URL, fetchImpl });
  const path = `/customers/${encodeURIComponent(customerId)}`;
  const [rawCustomer, rawAccounts] = await Promise.all([client.get<unknown>(path), client.get<unknown>(`${path}/accounts`)]);
  const customer = normalizeCustomer(rawCustomer);
  if (!customer.id || customer.id !== customerId || isRemovedCustomer(customer) || isClosedProfile(customer)) {
    throw new AccountOpeningError('That profile is no longer available. Please choose a profile from Sign in.', 404);
  }
  if (!Array.isArray(rawAccounts)) throw new Error('Could not check existing accounts');
  const accounts = rawAccounts.map(normalizeAccount);
  if (accounts.some((account) => !account.id || !account.type)) throw new Error('Could not check existing accounts');
  return { customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName }, accounts, available: availableProducts(accounts) };
}

type State = Awaited<ReturnType<typeof readAccountOpeningState>>;
type Outcome = { customerId: string; accounts?: State['accounts']; accountError?: string };
const attempts = new Map<string, { fingerprint: string; createdAt: number; result: Promise<Outcome> }>();
const activeCustomers = new Set<string>();

/** Recheck live ownership before any writes; serialize creation and retain uncertain outcomes. */
export async function openExistingAccounts(customerId: string, ids: AccountProductId[], key: string, runtime: Runtime, fetchImpl: FetchLike = fetch): Promise<Outcome> {
  const now = Date.now();
  for (const [id, attempt] of attempts) if (now - attempt.createdAt > 30 * 60_000) attempts.delete(id);
  const attemptId = `${customerId}:${key}`;
  const fingerprint = JSON.stringify([...ids].sort());
  const previous = attempts.get(attemptId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new AccountOpeningError('This selection was already submitted. Please check your dashboard.');
    return previous.result;
  }
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !openingProducts.some((product) => product.id === id))) {
    throw new AccountOpeningError('Choose valid accounts, once each.', 400);
  }
  if (activeCustomers.has(customerId)) throw new AccountOpeningError('An account request is already in progress for this profile. Please check your dashboard.');
  if (attempts.size >= 100) throw new AccountOpeningError('Account opening is busy. Please try again shortly.', 503);
  activeCustomers.add(customerId);
  const result = (async (): Promise<Outcome> => {
    try {
      const before = await readAccountOpeningState(customerId, runtime, fetchImpl);
      if (ids.some((id) => !before.available.some((product) => product.id === id))) {
        throw new AccountOpeningError('You already have one of those accounts. I’ve refreshed the remaining choices.');
      }
      let accountError: string | undefined;
      for (const id of ids) {
        const product = openingProducts.find((option) => option.id === id)!;
        const card = id === 'checking' || id === 'savings' ? null : demoCard(id, product.description);
        const categories: SpendingCategory[] = id === 'venture' ? ['travel'] : id === 'savor' ? ['dining', 'groceries', 'entertainment'] : ['other'];
        let outcome;
        try { outcome = await createNessieAccounts(customerId, [product.type], runtime, fetchImpl, { card, categories }); }
        catch { accountError = 'I couldn’t confirm the account request. Check your dashboard before opening another account.'; break; }
        if (outcome.accountError) { accountError = outcome.accountError; break; }
      }
      try {
        const after = await readAccountOpeningState(customerId, runtime, fetchImpl);
        return { customerId, accounts: after.accounts, ...(accountError ? { accountError } : {}) };
      } catch {
        return { customerId, accountError: accountError ?? 'Your account request was sent, but I couldn’t refresh the list. Check your dashboard before opening another account.' };
      }
    } finally { activeCustomers.delete(customerId); }
  })();
  attempts.set(attemptId, { fingerprint, result, createdAt: now });
  try { return await result; }
  catch (error) { attempts.delete(attemptId); throw error; } // Only pre-write reads/validation can throw.
}
