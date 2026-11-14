import { describe, expect, it, vi } from 'vitest';
import { mergeTransactions } from '../accounts';
import { buildDemoTransactions, seedNessieTransactions } from './seedTransactions';

const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };
const now = new Date('2026-11-14T12:00:00Z');

describe('sample transaction history', () => {
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
