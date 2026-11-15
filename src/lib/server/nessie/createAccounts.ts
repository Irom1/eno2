import type { RuntimeEnv } from '../env';
import { NessieClient, type FetchLike } from './client';
import { buildDemoTransactions, demoAccountTotals, DEMO_CARD_ANOMALY_LIMITS, DEMO_PROFILE_ANOMALY_LIMITS, type DemoAccountType, type DemoAnomalyLimits } from './seedTransactions';
import type { DemoCard, SpendingCategory } from '../../spending';
import { products } from '../../products';
import { signAccountSetup, type AccountSetupPlan } from './accountSetup';

/** Open selected accounts, then authorize sample history in separate requests. */
export async function createNessieAccounts(
  customerId: string,
  types: readonly DemoAccountType[],
  runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>,
  fetchImpl: FetchLike = fetch,
  options: { card?: DemoCard | null; categories?: readonly SpendingCategory[]; anomalyLimits?: DemoAnomalyLimits } = {}
): Promise<{ accountError?: string; setupToken?: string }> {
  const errors: string[] = [];
  const plans: AccountSetupPlan[] = [];
  const remaining = { ...options.anomalyLimits ?? DEMO_PROFILE_ANOMALY_LIMITS };
  const date = new Date().toISOString();
  const result = async (accountError?: string) => ({
    ...(accountError ? { accountError } : {}),
    ...(plans.length ? { setupToken: await signAccountSetup({ customerId, plans, expires: Date.now() + 30 * 60_000 }, runtime) } : {})
  });
  for (const type of [...new Set(types)]) {
    if (type === 'Credit Card' && !options.card) throw new Error('A matching demo card is required');
    const nickname = type === 'Credit Card' ? options.card!.nickname : type === 'Checking' ? products.checking.name : products.savings.name;
    const seed = type === 'Credit Card' ? `${customerId}:${type}:${options.card!.id}` : `${customerId}:${type}`;
    const anomalyLimits = {
      outliers: Math.max(0, Math.min(DEMO_CARD_ANOMALY_LIMITS.outliers, remaining.outliers)),
      duplicates: Math.max(0, Math.min(DEMO_CARD_ANOMALY_LIMITS.duplicates, remaining.duplicates))
    };
    remaining.outliers -= anomalyLimits.outliers;
    remaining.duplicates -= anomalyLimits.duplicates;
    const transactions = buildDemoTransactions(type, seed, new Date(date), options.categories, anomalyLimits);
    const totals = demoAccountTotals(transactions, type);
    const url = new URL(`/customers/${encodeURIComponent(customerId)}/accounts`, runtime.NESSIE_BASE_URL);
    url.searchParams.set('key', runtime.NESSIE_API_KEY);
    try {
      const response = await fetchImpl(url, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ type, nickname, ...totals }),
        redirect: 'manual', signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Account request failed'); }
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
      plans.push({ accountId, type, seed, date, categories: [...options.categories ?? []], anomalyLimits });
    } catch {
      // A write can succeed before a connection fails. Never retry it blindly.
      return result(`Your profile is ready, but I couldn’t confirm the ${type.toLowerCase()} account. Let’s check your dashboard before trying to open another one.`);
    }
  }
  return result(errors.length ? errors.join(' ') + ' Let’s check your dashboard before trying again.' : undefined);
}
