import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RuntimeEnv } from '../env';
import type { SpendingCategory } from '../../spending';
import { NessieClient, type FetchLike } from './client';
import { buildDemoTransactions, demoAccountTotals, type DemoAccountType } from './seedTransactions';
import { buildDemoObligations } from './seedObligations';

type Runtime = Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>;
export interface AccountSetupPlan {
  accountId: string;
  type: DemoAccountType;
  seed: string;
  date: string;
  categories: SpendingCategory[];
}
interface Setup { customerId: string; plans: AccountSetupPlan[]; expires: number }
export class AccountSetupError extends Error {}

function signature(payload: string, runtime: Runtime) {
  if (!runtime.NESSIE_API_KEY.trim()) throw new AccountSetupError('Account setup is unavailable.');
  return createHmac('sha256', runtime.NESSIE_API_KEY).update(`eno-account-setup-v1:${payload}`).digest();
}

// Signed state survives separate Worker isolates without relying on an in-memory
// session or task map. Only the server can authorize an account and its seed plan.
export async function signAccountSetup(setup: Setup, runtime: Runtime): Promise<string> {
  const payload = Buffer.from(JSON.stringify(setup)).toString('base64url');
  return `${payload}.${signature(payload, runtime).toString('base64url')}`;
}

function verify(token: string, runtime: Runtime): Setup {
  try {
    if (token.length > 12_000) throw new Error();
    const [payload, mac, extra] = token.split('.');
    if (!payload || !mac || extra !== undefined) throw new Error();
    const expected = signature(payload, runtime), actual = Buffer.from(mac, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const setup = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Setup;
    if (!setup.customerId || !setup.plans.length || setup.expires <= Date.now()) throw new Error();
    return setup;
  } catch { throw new AccountSetupError('Account setup expired or could not be verified. Check your dashboard before trying again.'); }
}

export async function combineAccountSetups(tokens: string[], runtime: Runtime): Promise<string | undefined> {
  if (!tokens.length) return undefined;
  const setups = tokens.map((token) => verify(token, runtime));
  if (setups.some((setup) => setup.customerId !== setups[0].customerId)) throw new AccountSetupError('Account setup profile changed.');
  return signAccountSetup({ customerId: setups[0].customerId, plans: setups.flatMap((setup) => setup.plans), expires: Math.min(...setups.map((setup) => setup.expires)) }, runtime);
}

type Row = Record<string, unknown>;
function missing<T extends object>(expected: T[], saved: unknown[]): T[] {
  // Count matching rows, including intentional duplicate purchases. Replaying a
  // completed batch reads Nessie first and never blindly writes the batch again.
  const remaining = [...saved];
  return expected.filter((item) => {
    const index = remaining.findIndex((row) => row && typeof row === 'object' &&
      Object.entries(item).every(([key, value]) => (row as Row)[key] === value));
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
}

/** At most 20 writes + four reads per invocation, below Workers Free's 50
 * subrequests. Finish one account at a time and preserve the seed date. */
export async function continueAccountSetup(token: string, runtime: Runtime, fetchImpl: FetchLike = fetch): Promise<{ customerId: string; setupToken?: string; accountError?: string }> {
  const setup = verify(token, runtime);
  const plan = setup.plans[0];
  const client = new NessieClient({ apiKey: runtime.NESSIE_API_KEY, baseUrl: runtime.NESSIE_BASE_URL, fetchImpl });
  const prefix = `/accounts/${encodeURIComponent(plan.accountId)}`;
  try {
    const transactions = buildDemoTransactions(plan.type, plan.seed, new Date(plan.date), plan.categories);
    const writes: { path: string; body: object }[] = [];
    // Fund deposit accounts before withdrawals; cards start with purchases.
    for (const kind of plan.type === 'Credit Card' ? ['withdrawal', 'deposit'] as const : ['deposit', 'withdrawal'] as const) {
      const path = `${prefix}/${kind === 'deposit' ? 'deposits' : 'withdrawals'}`;
      const saved = await client.get<unknown>(path);
      if (!Array.isArray(saved)) throw new Error('Transaction history unavailable');
      const expected = transactions.filter((item) => item.kind === kind).map(({ kind: _, ...body }) => body);
      writes.push(...missing(expected, saved).map((body) => ({ path, body })));
    }
    const obligations = buildDemoObligations(plan.type, demoAccountTotals(transactions, plan.type).balance, new Date(plan.date));
    if (!writes.length) {
      for (const [path, expected] of [[`${prefix}/bills`, obligations.bills], [`${prefix}/loans`, [obligations.loan]]] as const) {
        const saved = await client.get<unknown>(path);
        if (!Array.isArray(saved)) throw new Error('Account history unavailable');
        writes.push(...missing<object>([...expected], saved).map((body) => ({ path, body })));
      }
    }
    for (const { path, body } of writes.slice(0, 20)) {
      const url = new URL(path, runtime.NESSIE_BASE_URL);
      url.searchParams.set('key', runtime.NESSIE_API_KEY);
      const response = await fetchImpl(url, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(15_000)
      });
      const ok = response.ok;
      await response.body?.cancel();
      if (!ok) throw new Error('Sample activity request failed');
    }
    // Verify saved transactions on the next invocation before adding obligations.
    if (!writes.length) setup.plans.shift();
    return { customerId: setup.customerId, ...(setup.plans.length ? { setupToken: await signAccountSetup(setup, runtime) } : {}) };
  } catch {
    return { customerId: setup.customerId, accountError: 'Your profile and accounts are ready, but I couldn’t confirm all of their sample activity. Let’s check your dashboard before trying again.' };
  }
}
