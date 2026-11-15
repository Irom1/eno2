import type { RuntimeEnv } from '../env';
import type { FetchLike } from './client';
import type { SpendingCategory } from '../../spending';
import { GREEN_DEMO_MERCHANTS, NON_GREEN_DEMO_MERCHANTS } from '../../transactionImpact';
import { detectOutliers, merchantOutlierBaseline, toTransaction } from './tools/insights';

export type DemoAccountType = 'Checking' | 'Savings' | 'Credit Card';

export interface DemoAnomalyLimits { outliers: number; duplicates: number }
export const DEMO_CARD_ANOMALY_LIMITS: Readonly<DemoAnomalyLimits> = { outliers: 2, duplicates: 1 };
export const DEMO_PROFILE_ANOMALY_LIMITS: Readonly<DemoAnomalyLimits> = { outliers: 5, duplicates: 3 };

export interface DemoTransaction {
  kind: 'deposit' | 'withdrawal';
  medium: 'balance';
  transaction_date: string;
  status: 'completed' | 'pending';
  amount: number;
  description: string;
}

/** Demo points: one point per whole dollar of completed spending. */
export function demoAccountTotals(transactions: readonly DemoTransaction[], type: DemoAccountType = 'Checking') {
  const deposits = transactions.filter((item) => item.kind === 'deposit' && item.status === 'completed').reduce((sum, item) => sum + item.amount, 0);
  const spending = transactions.filter((item) => item.kind === 'withdrawal' && item.status === 'completed').reduce((sum, item) => sum + item.amount, 0);
  return { balance: Math.round((type === 'Credit Card' ? spending - deposits : deposits - spending) * 100) / 100, rewards: Math.floor(spending) };
}

/** Fifty deposits + fifty withdrawals fit both existing 50-row Nessie tools. */
export function buildDemoTransactions(type: DemoAccountType, accountId: string, now = new Date(), categories: readonly SpendingCategory[] = [], limits: Readonly<DemoAnomalyLimits> = DEMO_CARD_ANOMALY_LIMITS): DemoTransaction[] {
  const outlierLimit = Math.max(0, Math.min(DEMO_CARD_ANOMALY_LIMITS.outliers, Math.floor(limits.outliers)));
  const duplicateLimit = Math.max(0, Math.min(DEMO_CARD_ANOMALY_LIMITS.duplicates, Math.floor(limits.duplicates)));
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
  const cardMerchants: Record<SpendingCategory, readonly string[]> = {
    dining: ['LOCAL COFFEE', 'NEIGHBORHOOD RESTAURANT', 'DOORDASH'], groceries: ['WHOLE FOODS MARKET', 'TRADER JOE’S', 'SAFEWAY'],
    entertainment: ['SPOTIFY', 'AMC THEATRES', 'LIVE NATION CONCERT'], travel: ['DELTA AIR LINES', 'MARRIOTT HOTEL', 'AMTRAK'],
    shopping: ['TARGET', 'ONLINE MARKETPLACE', 'LOCAL BOOKSTORE'], gas: ['SHELL OIL', 'MBTA TRANSIT', 'UBER TRIP'],
    bills: ['COMCAST CABLE', 'EVERSOURCE ENERGY', 'MOBILE PHONE BILL'], other: ['LOCAL COFFEE', 'TARGET', 'TRADER JOE’S']
  };
  for (let index = 0; index < 50; index++) {
    const date = new Date(today - (90 - Math.floor(index * 90 / 49)) * 86_400_000).toISOString().slice(0, 10);
    const saving = type === 'Savings';
    if (type === 'Credit Card') {
      const category = categories.length ? categories[index % 5 < 3 ? 0 : index % categories.length] : 'other';
      const merchants = cardMerchants[category];
      const merchant = merchants[index % merchants.length];
      const amount = index === 0 ? 1000 : merchant === 'SHELL OIL' ? random(30, 65) : random(110, 280);
      const payment = random(35, 100);
      // Purchases exceed payments throughout the history, yielding a positive
      // balance owed. Card payments are Nessie deposits; purchases withdrawals.
      result.push({ kind: 'withdrawal', medium: 'balance', transaction_date: date, status: 'completed', amount, description: index === 0 ? 'DEMO OPENING PURCHASE' : merchant });
      result.push({ kind: 'deposit', medium: 'balance', transaction_date: date, status: 'completed', amount: merchant === 'SHELL OIL' ? Math.min(payment, Math.floor(amount * 0.6)) : payment, description: 'DEMO CREDIT CARD PAYMENT' });
      continue;
    }
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
  const withdrawals = result.filter((item) => item.kind === 'withdrawal');
  const credits = result.filter((item) => item.kind === 'deposit');
  // Keep the initial funding/purchase markers intact. Most history remains
  // ordinary and personalized; these examples exercise existing insight tools.
  for (let index = 0; index < GREEN_DEMO_MERCHANTS.length; index++) {
    Object.assign(withdrawals[8 + index], { description: GREEN_DEMO_MERCHANTS[index], amount: 20 + index * 7 });
    Object.assign(withdrawals[16 + index], { description: NON_GREEN_DEMO_MERCHANTS[index], amount: 65 + index * 17 });
  }
  // Pick different familiar, usually low-cost merchants per account. Their
  // normal purchases make the oversized charges reviewable against real history.
  const unusualMerchants = [
    ['SHELL GAS STATION', 30, 65], ['NEIGHBORHOOD RESTAURANT', 18, 85],
    ['LOCAL COFFEE', 4, 12], ['AMC THEATRES', 12, 35],
    ['LOCAL BOOKSTORE', 15, 55], ['CVS PHARMACY', 9, 65],
    ['MBTA TRANSIT', 10, 35], ['WHOLE FOODS MARKET', 35, 95]
  ] as const;
  // Exactly one possible gas outlier in ~30% of histories; the other examples
  // come from non-gas merchants so fuel does not dominate every ClimateWise score.
  const includeGas = random(0, 99) < 30;
  const candidates = unusualMerchants.filter(([description]) => description !== 'SHELL GAS STATION');
  const unusualPurchases: DemoTransaction[] = [];
  for (let index = 0; index < outlierLimit; index++) {
    const [description, min, max] = index === 0 && includeGas ? unusualMerchants[0] : candidates.splice(random(0, candidates.length - 1), 1)[0];
    Object.assign(withdrawals[1 + index * 2], { description, amount: random(min, Math.floor((min + max) / 2)) });
    Object.assign(withdrawals[2 + index * 2], { description, amount: random(Math.floor((min + max) / 2) + 1, max) });
    const purchase = withdrawals[random(30 + index * 5, 33 + index * 5)];
    Object.assign(purchase, { description, amount: 0 });
    unusualPurchases.push(purchase);
  }
  const dateAgo = (days: number) => new Date(today - days * 86_400_000).toISOString().slice(0, 10);
  // At most one deliberate duplicate pair among 100 total records. Use the
  // account's seeded randomness so vendors, amounts, and dates vary across
  // accounts but remain stable when account setup resumes.
  const duplicateExamples = new Set<DemoTransaction>();
  if (duplicateLimit) {
    const duplicateMerchants = [
      ['NETFLIX', 15, 25], ['HULU', 10, 25], ['DISNEY PLUS', 10, 22],
      ['ADOBE', 20, 65], ['AMAZON PRIME', 15, 20], ['PETCO', 15, 85],
      ['HOME DEPOT', 20, 95], ['PANERA BREAD', 12, 45],
      ['UBER EATS', 18, 60], ['STAPLES', 15, 75]
    ] as const;
    const [description, min, max] = duplicateMerchants[random(0, duplicateMerchants.length - 1)];
    const amount = random(min, max);
    const daysAgo = random(10, 23);
    const gap = random(1, 3);
    Object.assign(withdrawals[39], { description, amount, transaction_date: dateAgo(daysAgo) });
    Object.assign(withdrawals[40], { description, amount, transaction_date: dateAgo(daysAgo - gap) });
    duplicateExamples.add(withdrawals[39]);
    duplicateExamples.add(withdrawals[40]);
  }
  // Six recent unsettled records stay visible but do not affect posted totals.
  for (let index = 46; index < 50; index++) Object.assign(withdrawals[index], { status: 'pending', transaction_date: dateAgo(index % 2) });
  for (let index = 48; index < 50; index++) Object.assign(credits[index], { status: 'pending', transaction_date: dateAgo(index % 2) });
  // Random ordinary purchases must not introduce additional double charges.
  // Reserve the intentional pair before checking the rest of the history.
  const matchesNearby = (purchase: DemoTransaction, other: DemoTransaction) => other !== purchase &&
    other.description === purchase.description && other.amount === purchase.amount &&
    Math.abs(Date.parse(other.transaction_date) - Date.parse(purchase.transaction_date)) <= 3 * 86_400_000;
  const settled = [...duplicateExamples];
  for (const purchase of withdrawals) {
    if (purchase.status !== 'completed' || duplicateExamples.has(purchase)) continue;
    while (settled.some((other) => matchesNearby(purchase, other))) purchase.amount++;
    settled.push(purchase);
  }
  for (const purchase of unusualPurchases) {
    const ordinary = withdrawals.filter((item) => item !== purchase && item.description === purchase.description && item.status === 'completed').map((item) => item.amount);
    const largest = Math.max(...ordinary, 1);
    // Evaluate the baseline with this purchase above its normal peers. The
    // actual sample sits just past that threshold, rather than costing thousands
    // at a gas station and overwhelming the spend-based ClimateWise estimate.
    const { threshold } = merchantOutlierBaseline([...ordinary, largest * 1000]);
    purchase.amount = Math.ceil(Math.max(threshold, largest)) + random(25, 75);
  }
  // Mixed spending categories can create incidental outliers as well. Keep at
  // most the allocated number of findings using the same detector as the app,
  // preserving the deliberate oversized purchases.
  const protectedPurchases = new Set(unusualPurchases);
  for (;;) {
    const posted = withdrawals.flatMap((item, index) => toTransaction({ ...item, _id: String(index) }, 'withdrawal') ?? []);
    const outliers = detectOutliers(posted, now);
    if (outliers.length <= outlierLimit) break;
    const incidental = outliers.find((finding) => !protectedPurchases.has(withdrawals[Number(finding._id)]))!;
    const purchase = withdrawals[Number(incidental._id)];
    // Bring one incidental spike back to its baseline, then recalculate because
    // changing an amount also changes the baseline for the remaining purchases.
    purchase.amount = Math.max(1, Math.floor(incidental.median));
    while (settled.some((other) => matchesNearby(purchase, other))) purchase.amount++;
  }
  if (type === 'Credit Card') {
    // A normalized opening purchase still needs a smaller opening payment.
    credits[0].amount = Math.min(credits[0].amount, Math.max(1, Math.floor(withdrawals[0].amount * 0.6)));
  }
  return result;
}

export async function seedNessieTransactions(
  accountId: string,
  type: DemoAccountType,
  runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>,
  fetchImpl: FetchLike = fetch,
  transactions: readonly DemoTransaction[] = buildDemoTransactions(type, accountId)
): Promise<{ created: number; complete: boolean }> {
  let created = 0;
  let failed = false;
  // Fund the account first, then write withdrawals. Four workers keep the
  // signup responsive without sending a burst of 100 concurrent requests.
  for (const kind of type === 'Credit Card' ? ['withdrawal', 'deposit'] as const : ['deposit', 'withdrawal'] as const) {
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
            body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(15_000)
          });
          const ok = response.ok;
          await response.body?.cancel();
          if (!ok) { failed = true; return; }
          created += 1;
        } catch { failed = true; return; }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }
  return { created, complete: !failed && created === 100 };
}
