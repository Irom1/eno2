import type { RuntimeEnv } from '../env';
import { NessieClient, type FetchLike } from './client';
import { buildDemoTransactions, demoAccountTotals, seedNessieTransactions, type DemoAccountType } from './seedTransactions';
import type { DemoCard, SpendingCategory } from '../../spending';
import { products } from '../../products';
import { seedNessieObligations } from './seedObligations';

/** Open only the selected demo accounts and populate each with sample history. */
export async function createNessieAccounts(
  customerId: string,
  types: readonly DemoAccountType[],
  runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>,
  fetchImpl: FetchLike = fetch,
  options: { card?: DemoCard | null; categories?: readonly SpendingCategory[] } = {}
): Promise<{ accountError?: string }> {
  const errors: string[] = [];
  for (const type of [...new Set(types)]) {
    if (type === 'Credit Card' && !options.card) throw new Error('A matching demo card is required');
    const nickname = type === 'Credit Card' ? options.card!.nickname : type === 'Checking' ? products.checking.name : products.savings.name;
    const transactions = buildDemoTransactions(type, `${customerId}:${type}`, new Date(), options.categories);
    const totals = demoAccountTotals(transactions, type);
    const url = new URL(`/customers/${encodeURIComponent(customerId)}/accounts`, runtime.NESSIE_BASE_URL);
    url.searchParams.set('key', runtime.NESSIE_API_KEY);
    try {
      const response = await fetchImpl(url, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ type, nickname, ...totals }),
        redirect: 'error', signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error('Account request failed');
      let accountId: string | undefined;
      try {
        const result = await response.json() as { objectCreated?: { _id?: string }; _id?: string };
        accountId = result?.objectCreated?._id ?? result?._id;
      } catch { /* Text-only acknowledgements need a fresh account lookup. */ }
      if (!accountId) {
        const reader = new NessieClient({ apiKey: runtime.NESSIE_API_KEY, baseUrl: runtime.NESSIE_BASE_URL, fetchImpl });
        const accounts = await reader.get<unknown>(`/customers/${encodeURIComponent(customerId)}/accounts`);
        const matches = Array.isArray(accounts) ? accounts.filter((account) => account && account.type === type && account.nickname === nickname) : [];
        if (matches.length === 1 && typeof matches[0]._id === 'string') accountId = matches[0]._id;
      }
      if (!accountId) { errors.push(`The ${type.toLowerCase()} account was created, but I couldn’t find it to add its demo activity.`); continue; }
      const seeded = await seedNessieTransactions(accountId, type, runtime, fetchImpl, transactions);
      if (!seeded.complete) errors.push(`Your ${type.toLowerCase()} account is ready, but I could only confirm ${seeded.created} of its 100 demo transactions.`);
      const obligations = await seedNessieObligations(accountId, type, totals.balance, runtime, fetchImpl);
      if (!obligations.complete) errors.push(`I could confirm ${obligations.bills} sample bills and ${obligations.loans} sample loans for your ${type.toLowerCase()} account. Some of that sample data may still be missing.`);
    } catch {
      // A write can succeed before a connection fails. Never retry it blindly.
      return { accountError: `Your profile is ready, but I couldn’t confirm the ${type.toLowerCase()} account. Let’s check your dashboard before trying to open another one.` };
    }
  }
  return errors.length ? { accountError: errors.join(' ') + ' Let’s check your dashboard before trying again.' } : {};
}
