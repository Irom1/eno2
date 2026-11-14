import type { RuntimeEnv } from '../env';
import type { FetchLike } from './client';

export interface DemoTransaction {
  kind: 'deposit' | 'withdrawal';
  medium: 'balance';
  transaction_date: string;
  status: 'completed';
  amount: number;
  description: string;
}

/** Fifty deposits + fifty withdrawals fit both existing 50-row Nessie tools. */
export function buildDemoTransactions(type: 'Checking' | 'Savings', accountId: string, now = new Date()): DemoTransaction[] {
  let state = [...accountId].reduce((hash, letter) => (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0, 2166136261);
  const random = (min: number, max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return min + state % (max - min + 1); };
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const deposits = ['EXPENSE REIMBURSEMENT', 'VENMO PAYMENT RECEIVED', 'ONLINE MARKETPLACE SALE', 'PURCHASE REFUND', 'CASHBACK REWARD'];
  const spending = [
    ['WHOLE FOODS MARKET', 45, 130], ['LOCAL COFFEE', 4, 12], ['SHELL OIL', 30, 65],
    ['DOORDASH', 18, 45], ['COMCAST CABLE', 79, 79], ['EVERSOURCE ENERGY', 95, 165],
    ['TRADER JOE’S', 35, 95], ['TARGET', 20, 110], ['MBTA TRANSIT', 10, 35], ['SPOTIFY', 11, 11]
  ] as const;
  const result: DemoTransaction[] = [];
  for (let index = 0; index < 50; index++) {
    const date = new Date(today - (90 - Math.floor(index * 90 / 49)) * 86_400_000).toISOString().slice(0, 10);
    const saving = type === 'Savings';
    result.push({
      kind: 'deposit', medium: 'balance', transaction_date: date, status: 'completed',
      amount: index === 0 ? saving ? 5000 : 10000 : !saving && index % 10 === 0 ? 2400 : saving ? random(80, 300) : random(25, 250),
      description: index === 0 ? 'DEMO OPENING DEPOSIT' : saving ? index % 10 === 0 ? 'SAVINGS GOAL CONTRIBUTION' : 'AUTOMATIC SAVINGS TRANSFER' : index % 10 === 0 ? 'ACME CORP PAYROLL' : deposits[index % deposits.length]
    });
    const merchant = spending[index % spending.length];
    result.push({
      kind: 'withdrawal', medium: 'balance', transaction_date: date, status: 'completed',
      amount: saving ? random(25, 140) : index % 15 === 0 ? 1450 : random(merchant[1], merchant[2]),
      description: saving ? index % 8 === 0 ? 'SAVINGS GOAL WITHDRAWAL' : 'TRANSFER TO EVERYDAY SPENDING' : index % 15 === 0 ? 'BOSTON PROPERTIES RENT' : merchant[0]
    });
  }
  return result;
}

export async function seedNessieTransactions(
  accountId: string,
  type: 'Checking' | 'Savings',
  runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>,
  fetchImpl: FetchLike = fetch
): Promise<{ created: number; complete: boolean }> {
  const transactions = buildDemoTransactions(type, accountId);
  let created = 0;
  let failed = false;
  // Fund the account first, then write withdrawals. Four workers keep the
  // signup responsive without sending a burst of 100 concurrent requests.
  for (const kind of ['deposit', 'withdrawal'] as const) {
    if (failed) break;
    const queue = transactions.filter((transaction) => transaction.kind === kind);
    let cursor = 0;
    const worker = async () => {
      while (!failed && cursor < queue.length) {
        const { kind: transactionKind, ...body } = queue[cursor++];
        const url = new URL(`/accounts/${encodeURIComponent(accountId)}/${transactionKind === 'deposit' ? 'deposits' : 'withdrawals'}`, runtime.NESSIE_BASE_URL);
        url.searchParams.set('key', runtime.NESSIE_API_KEY);
        try {
          const response = await fetchImpl(url, {
            method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000)
          });
          if (!response.ok) { failed = true; return; }
          created += 1;
        } catch { failed = true; return; }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }
  return { created, complete: !failed && created === 100 };
}
