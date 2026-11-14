import { describe, expect, it, vi } from 'vitest';
import { mergeTransactions } from '../accounts';
import { buildDemoTransactions, demoAccountTotals, seedNessieTransactions } from './seedTransactions';

const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };
const now = new Date('2026-11-14T12:00:00Z');

describe('sample transaction history', () => {
  it('builds a personalized credit card with 100 purchases/payments and the correct balance owed and points', () => {
    const history = buildDemoTransactions('Credit Card', 'travel-card', now, ['travel']);
    expect(history).toHaveLength(100);
    const purchases = history.filter((item) => item.kind === 'withdrawal');
    const payments = history.filter((item) => item.kind === 'deposit');
    expect(purchases).toHaveLength(50); expect(payments).toHaveLength(50);
    expect(purchases.slice(1).every((item) => /DELTA|MARRIOTT|AMTRAK/.test(item.description))).toBe(true);
    let owed = 0;
    for (const transaction of history) {
      owed += transaction.kind === 'withdrawal' ? transaction.amount : -transaction.amount;
      expect(owed).toBeGreaterThan(0);
    }
    const totals = demoAccountTotals(history, 'Credit Card');
    expect(totals.balance).toBe(owed);
    expect(totals.rewards).toBe(purchases.reduce((sum, item) => sum + item.amount, 0));
    const transactions = history.map((item, index) => ({ ...item, _id: String(index).padStart(3, '0') }));
    const merged = mergeTransactions(transactions.filter((item) => item.kind === 'deposit'), transactions.filter((item) => item.kind === 'withdrawal'), owed, true);
    expect(merged[0].balanceAfter).toBe(owed);
    for (let index = 1; index < merged.length; index++) {
      const prior = merged[index - 1];
      expect(merged[index].balanceAfter).toBe(prior.balanceAfter! + (prior.kind === 'deposit' ? prior.amount : -prior.amount));
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
        balance += transaction.kind === 'deposit' ? transaction.amount : -transaction.amount;
        expect(balance).toBeGreaterThanOrEqual(0);
      }
      const raw = (items: typeof transactions) => items.map((item, index) => ({ ...item, _id: `${item.kind}-${index}` }));
      const activity = mergeTransactions(raw(deposits), raw(withdrawals), balance);
      expect(activity).toHaveLength(100);
      expect(activity[0].balanceAfter).toBe(balance);
    });
  }
  it('writes all 100 records through Nessie deposit and withdrawal endpoints, funding before spending', async () => {
    let deposits = 0;
    const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/deposits')) deposits++;
      else expect(deposits).toBe(50);
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ medium: 'balance', status: 'completed' });
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
