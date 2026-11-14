import type { RuntimeEnv } from '../env';
import type { FetchLike } from './client';
import type { DemoAccountType } from './seedTransactions';

export function buildDemoObligations(type: DemoAccountType, balance: number, now = new Date()) {
  const date = (days: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
  // Nessie generates upcoming_payment_date for recurring bills. Every bill
  // needs recurring_date; creation_date/upcoming_payment_date are read-only.
  const bills = [
    { status: 'recurring', payee: type === 'Credit Card' ? 'Capital One demo statement' : 'Demo mobile phone', nickname: 'Sample upcoming payment', payment_date: date(5), payment_amount: type === 'Credit Card' ? Math.max(25, Math.round(balance * .03)) : 65 },
    { status: 'recurring', payee: 'Demo energy cooperative', nickname: 'Sample energy bill', payment_date: date(12), payment_amount: 92 },
    { status: 'recurring', payee: 'Demo home internet', nickname: 'Sample monthly internet', payment_date: date(20), recurring_date: Number(date(20).slice(-2)), payment_amount: 79 }
  ].map((bill) => ({ ...bill, recurring_date: bill.recurring_date ?? Number(bill.payment_date.slice(-2)) }));
  const loan = { type: type === 'Checking' ? 'auto' : 'personal', status: 'approved', credit_score: 740, monthly_payment: type === 'Checking' ? 285 : 120, amount: type === 'Checking' ? 12000 : 3500, description: type === 'Checking' ? 'Fictional demo auto loan' : 'Fictional demo personal loan' };
  return { bills, loan };
}

/** Save sample bills/loans in Nessie; dashboard and Eno read those same records.
 * No automatic write retries: a failed acknowledgement may still mean saved. */
export async function seedNessieObligations(accountId: string, type: DemoAccountType, balance: number, runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>, fetchImpl: FetchLike = fetch) {
  const plan = buildDemoObligations(type, balance);
  let bills = 0; let loans = 0;
  for (const item of [...plan.bills.map((body) => ({ path: 'bills', body })), { path: 'loans', body: plan.loan }]) {
    const url = new URL(`/accounts/${encodeURIComponent(accountId)}/${item.path}`, runtime.NESSIE_BASE_URL);
    url.searchParams.set('key', runtime.NESSIE_API_KEY);
    try {
      const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(item.body), signal: AbortSignal.timeout(15_000), redirect: 'error' });
      if (!response.ok) return { bills, loans, complete: false };
      if (item.path === 'bills') bills++; else loans++;
    } catch { return { bills, loans, complete: false }; }
  }
  return { bills, loans, complete: true };
}
