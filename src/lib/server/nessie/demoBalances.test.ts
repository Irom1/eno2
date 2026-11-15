import { expect, it, vi } from 'vitest';
import { NessieClient } from './client';

it.each(['Checking', 'Savings'])('reconciles %s balances and clears legacy points on account and customer reads', async (type) => {
  const account = { _id: 'demo-id', type, nickname: type === 'Checking' ? 'Everyday Checking' : 'My Savings', balance: 0, rewards: 150 };
  const transport = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/deposits')) return Response.json([{ status: 'completed', amount: 1000, description: 'DEMO OPENING DEPOSIT' }, { status: 'pending', amount: 99 }]);
    if (path.endsWith('/withdrawals')) return Response.json([{ status: 'completed', amount: 125.5 }, { status: 'cancelled', amount: 500 }, { status: 'completed', amount: '24.75' }]);
    return Response.json(path.startsWith('/customers/') ? [account] : account);
  });
  const client = new NessieClient({ apiKey: 'test', baseUrl: 'https://nessie.test', fetchImpl: transport });
  const expected = { ...account, balance: 849.75, rewards: 0 };
  expect(await client.get('/accounts/demo-id')).toEqual(expected);
  expect(await client.get('/customers/customer-id/accounts')).toEqual([expected]);
  expect(transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/withdrawals'))).toHaveLength(1);
});

it('preserves other customers’ account metadata and ignores lookalike accounts without the demo marker', async () => {
  const accounts = [{ _id: 'ordinary', type: 'Checking', nickname: 'Everyday Checking', balance: 800, rewards: 70 }, { _id: 'other', type: 'Savings', nickname: 'Travel fund', balance: 400, rewards: 30 }];
  const transport = vi.fn(async (url: RequestInfo | URL) => Response.json(new URL(String(url)).pathname.endsWith('/deposits') ? [] : accounts));
  const client = new NessieClient({ apiKey: 'test', baseUrl: 'https://nessie.test', fetchImpl: transport });
  expect(await client.get('/customers/customer-id/accounts')).toEqual(accounts);
  expect(transport.mock.calls).toHaveLength(2);
});

it('reconciles demo credit card debt and points, including a partially seeded card without payments', async () => {
  const account = { _id: 'card', type: 'Credit Card', nickname: 'Savor · Eno demo', balance: 999, rewards: 999 };
  const transport = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/withdrawals')) return Response.json([{ status: 'completed', amount: 500, description: 'DEMO OPENING PURCHASE' }, { status: 'completed', amount: 25 }]);
    if (path.endsWith('/deposits')) return Response.json([]);
    return Response.json(account);
  });
  const client = new NessieClient({ apiKey: 'test', baseUrl: 'https://nessie.test', fetchImpl: transport });
  expect(await client.get('/accounts/card')).toEqual({ ...account, balance: 525, rewards: 525 });
});
