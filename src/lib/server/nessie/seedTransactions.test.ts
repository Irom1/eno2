import { describe, expect, it, vi } from 'vitest';
import { demoTransactionImpact } from '../../transactionImpact';
import { detectDuplicateCharges, detectOutliers, toTransaction } from './tools/insights';
import { mergeTransactions } from '../accounts';
import { buildDemoTransactions, demoAccountTotals, seedNessieTransactions } from './seedTransactions';

const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };
const now = new Date('2026-11-14T12:00:00Z');

describe('sample transaction history', () => {
  it('caps unusual charges at four and double-charge instances at two across account profiles and dates', () => {
    const categories = ['dining', 'groceries', 'entertainment', 'travel', 'shopping', 'gas', 'bills', 'other'] as const;
    for (const type of ['Checking', 'Savings', 'Credit Card'] as const) {
      for (let index = 0; index < 1000; index++) {
        const asOf = new Date(Date.UTC(2026, index % 12, 1 + index % 28));
        const preferences = index % 3 === 0 ? [] : index % 3 === 1 ? [categories[index % categories.length]] : [...categories];
        const history = buildDemoTransactions(type, `limited-anomalies-${index}`, asOf, preferences);
        const posted = history.filter((item) => item.kind === 'withdrawal')
          .flatMap((item, id) => toTransaction({ ...item, _id: String(id) }, 'withdrawal') ?? []);
        const context = `${type} account ${index} on ${asOf.toISOString()}`;
        expect(detectOutliers(posted, asOf).length, context).toBeLessThanOrEqual(4);
        expect(detectDuplicateCharges(posted), context).toHaveLength(2);
        expect(buildDemoTransactions(type, `limited-anomalies-${index}`, asOf, preferences)).toEqual(history);
      }
    }
  });
  it('puts an oversized gas-station charge in about 30% of new histories', () => {
    for (const type of ['Checking', 'Savings', 'Credit Card'] as const) {
      let withGas = 0;
      for (let index = 0; index < 1000; index++) {
        const history = buildDemoTransactions(type, `gas-distribution-${index}`, now);
        const gas = history.filter((item) => item.description === 'SHELL GAS STATION' && item.amount > 100);
        expect(gas.length).toBeLessThanOrEqual(1);
        if (gas.length) withGas++;
        expect(gas.every((item) => item.amount <= 350)).toBe(true);
      }
      expect(withGas).toBeGreaterThanOrEqual(250);
      expect(withGas).toBeLessThanOrEqual(350);
    }
  });
  for (const type of ['Checking', 'Savings', 'Credit Card'] as const) {
    it(`includes pending, environmental, unusual, and a small number of duplicate examples for ${type}`, () => {
      const history = buildDemoTransactions(type, 'scenario-account', now, ['dining']);
      expect(history).toHaveLength(100);
      expect(history.filter((item) => item.status === 'pending')).toHaveLength(6);
      expect(history.filter((item) => demoTransactionImpact(item.description) === 'green')).toHaveLength(5);
      expect(history.filter((item) => demoTransactionImpact(item.description) === 'non-green')).toHaveLength(5);
      const posted = history.filter((item) => item.kind === 'withdrawal').map((item, index) => toTransaction({ ...item, _id: String(index) }, 'withdrawal')).filter((item) => item !== null);
      const duplicates = detectDuplicateCharges(posted);
      expect(duplicates).toHaveLength(2);
      expect(duplicates.map((item) => item.description)).toEqual(expect.arrayContaining(['NETFLIX', 'LOCAL BOOKSTORE']));
      const suspicious = detectOutliers(posted, now).filter((finding) =>
        posted.some((item) => item.id !== finding._id && item.description === finding.description && item.amount < 100 && item.amount * 4 < finding.amount));
      expect(suspicious).toHaveLength(2);
      const totals = demoAccountTotals(history, type);
      expect(totals.balance).toBeGreaterThan(0);
      const withLargePending = history.map((item) => item.status === 'pending' ? { ...item, amount: 999999 } : item);
      expect(demoAccountTotals(withLargePending, type)).toEqual(totals);
    });
  }
  it('varies suspicious merchants, amounts and dates across accounts while always flagging them', () => {
    const merchantPairs = new Set<string>();
    const amounts = new Set<number>();
    const categories = ['dining', 'groceries', 'entertainment', 'travel', 'shopping', 'gas', 'bills', 'other'] as const;
    for (const type of ['Checking', 'Savings', 'Credit Card'] as const) {
      for (let index = 0; index < 100; index++) {
        const history = buildDemoTransactions(type, `varied-account-${index}`, now, [categories[index % categories.length]]);
        const posted = history.filter((item) => item.kind === 'withdrawal').map((item, index) => toTransaction({ ...item, _id: String(index) }, 'withdrawal')).filter((item) => item !== null);
        const outliers = detectOutliers(posted, now);
        expect(outliers.length, `${type} account ${index} unusual charges`).toBeLessThanOrEqual(4);
        const suspicious = outliers.filter((finding) =>
          posted.some((item) => item.id !== finding._id && item.description === finding.description && item.amount < 100 && item.amount * 4 < finding.amount));
        expect(suspicious, `${type} account ${index}`).toHaveLength(2);
        merchantPairs.add(suspicious.map((item) => item.description).sort().join('|'));
        suspicious.forEach((item) => amounts.add(item.amount));
        expect(demoAccountTotals(history, type).balance).toBeGreaterThan(0);
        let postedBalance = 0;
        for (const item of history) {
          if (item.status === 'completed') postedBalance += (item.kind === 'withdrawal' ? -1 : 1) * item.amount * (type === 'Credit Card' ? -1 : 1);
          expect(postedBalance, `${type} account ${index} running balance`).toBeGreaterThanOrEqual(0);
        }
        expect(detectDuplicateCharges(posted), `${type} account ${index} double charges`).toHaveLength(2);
      }
    }
    expect(merchantPairs.size).toBeGreaterThan(10);
    expect(amounts.size).toBeGreaterThan(50);
  });
  it('builds a personalized credit card with 100 purchases/payments and the correct balance owed and points', () => {
    const history = buildDemoTransactions('Credit Card', 'travel-card', now, ['travel']);
    expect(history).toHaveLength(100);
    const purchases = history.filter((item) => item.kind === 'withdrawal');
    const payments = history.filter((item) => item.kind === 'deposit');
    expect(purchases).toHaveLength(50); expect(payments).toHaveLength(50);
    expect(purchases.filter((item) => /DELTA|MARRIOTT|AMTRAK/.test(item.description)).length).toBeGreaterThan(25);
    let owed = 0;
    for (const transaction of history) {
      if (transaction.status === 'completed') owed += transaction.kind === 'withdrawal' ? transaction.amount : -transaction.amount;
      expect(owed).toBeGreaterThan(0);
    }
    const totals = demoAccountTotals(history, 'Credit Card');
    expect(totals.balance).toBe(owed);
    expect(totals.rewards).toBe(purchases.filter((item) => item.status === 'completed').reduce((sum, item) => sum + item.amount, 0));
    const transactions = history.map((item, index) => ({ ...item, _id: String(index).padStart(3, '0') }));
    const merged = mergeTransactions(transactions.filter((item) => item.kind === 'deposit'), transactions.filter((item) => item.kind === 'withdrawal'), owed, true);
    const posted = merged.filter((item) => item.status === 'completed');
    expect(posted[0].balanceAfter).toBe(owed);
    expect(merged.filter((item) => item.status === 'pending').every((item) => item.balanceAfter === undefined)).toBe(true);
    for (let index = 1; index < posted.length; index++) {
      const prior = posted[index - 1];
      expect(posted[index].balanceAfter).toBe(prior.balanceAfter! + (prior.kind === 'deposit' ? prior.amount : -prior.amount));
    }
  });
  for (const type of ['Checking', 'Savings'] as const) {
    it(`builds 100 readable ${type.toLowerCase()} transactions with a consistent positive balance`, () => {
      const transactions = buildDemoTransactions(type, 'account-123', now);
      expect(transactions).toHaveLength(100);
      const deposits = transactions.filter((item) => item.kind === 'deposit');
      const withdrawals = transactions.filter((item) => item.kind === 'withdrawal');
      expect(deposits).toHaveLength(50); expect(withdrawals).toHaveLength(50);
      let balance = 0;
      for (const transaction of transactions) {
        expect(transaction.transaction_date >= '2026-08-16' && transaction.transaction_date <= '2026-11-14').toBe(true);
        expect(Number.isInteger(transaction.amount) && transaction.amount > 0).toBe(true);
        if (transaction.status === 'completed') balance += transaction.kind === 'deposit' ? transaction.amount : -transaction.amount;
        expect(balance).toBeGreaterThanOrEqual(0);
      }
      const raw = (items: typeof transactions) => items.map((item, index) => ({ ...item, _id: `${item.kind}-${index}` }));
      const activity = mergeTransactions(raw(deposits), raw(withdrawals), balance);
      expect(activity).toHaveLength(100);
      expect(activity.find((item) => item.status === 'completed')?.balanceAfter).toBe(balance);
    });
  }
  it('writes all 100 records through Nessie deposit and withdrawal endpoints, funding before spending', async () => {
    let deposits = 0;
    const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/deposits')) deposits++;
      else expect(deposits).toBe(50);
      const body = JSON.parse(String(init?.body));
      expect(body.medium).toBe('balance');
      expect(['completed', 'pending']).toContain(body.status);
      expect(body.kind).toBeUndefined();
      expect(init?.method).toBe('POST');
      return Response.json({ code: 201 }, { status: 201 });
    });
    await expect(seedNessieTransactions('new-account', 'Checking', runtime, transport)).resolves.toEqual({ created: 100, complete: true });
    expect(transport).toHaveBeenCalledTimes(100);
    expect(transport.mock.calls.every(([url]) => new URL(String(url)).pathname.startsWith('/accounts/new-account/'))).toBe(true);
  });
  it('reports partial history and never repeats a failed write', async () => {
    let calls = 0;
    const transport = vi.fn(async () => { calls++; return Response.json({}, { status: calls === 3 ? 503 : 201 }); });
    const result = await seedNessieTransactions('new-account', 'Savings', runtime, transport);
    expect(result.complete).toBe(false);
    expect(result.created).toBeLessThan(100);
    expect(transport.mock.calls.length).toBeLessThan(10);
  });
});
