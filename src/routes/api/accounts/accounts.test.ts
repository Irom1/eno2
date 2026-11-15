import { expect, it, vi } from 'vitest';
import { callTool } from '$lib/server/mcp';
import { createSession } from '$lib/server/session';
import { GET } from './+server';

vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/mcp', () => ({
  callTool: vi.fn(),
  withMcp: (_runtime: unknown, read: () => Promise<unknown>) => read()
}));

it('returns the five newest transactions across the customer accounts with their account IDs', async () => {
  const customer = { id: 'customer', firstName: 'Ada', lastName: 'Lovelace' };
  const accounts = [
    { id: 'checking', type: 'Checking', balance: 100 },
    { id: 'savings', type: 'Savings', balance: 200 },
    { id: 'credit', type: 'Credit Card', balance: 300 }
  ];
  const transactions = {
    checking: [1, 4, 6],
    savings: [2, 5],
    credit: [3, 7]
  };
  const session = createSession(customer, []);
  vi.mocked(callTool).mockImplementation(async (_mcp, name, args) => {
    if (name === 'nessie_get_customer') return { ok: true, text: '', data: customer };
    if (name === 'nessie_list_customer_accounts') return { ok: true, text: '', data: { items: accounts } };

    const accountId = args?.accountId as keyof typeof transactions;
    const days = name === 'nessie_list_account_deposits'
      ? transactions[accountId].slice(0, 1)
      : name === 'nessie_list_account_withdrawals'
        ? transactions[accountId].slice(1)
        : [];
    const items = days.map((day) => ({
      id: `transaction-${day}`,
      transactionDate: `2026-11-0${day}`,
      amount: 10
    }));
    return { ok: true, text: '', data: { items } };
  });

  const response = await GET({ cookies: { get: () => session.id } } as unknown as Parameters<typeof GET>[0]);
  expect(response.status).toBe(200);
  const snapshot = await response.json();
  expect(snapshot.recentActivity).toMatchObject([
    { id: 'transaction-7', accountId: 'credit', kind: 'withdrawal' },
    { id: 'transaction-6', accountId: 'checking', kind: 'withdrawal' },
    { id: 'transaction-5', accountId: 'savings', kind: 'withdrawal' },
    { id: 'transaction-4', accountId: 'checking', kind: 'withdrawal' },
    { id: 'transaction-3', accountId: 'credit', kind: 'deposit' }
  ]);
});
