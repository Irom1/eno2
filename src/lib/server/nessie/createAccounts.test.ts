import { expect, it, vi } from 'vitest';
import { createNessieAccounts } from './createAccounts';
import { recommendDemoCard } from '../../spending';
const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };

it('persists the matching credit card and its exact transaction-derived balance and points', async () => {
  const card = recommendDemoCard({ status: 'personalize', categories: ['dining', 'groceries'] })!;
  let account: Record<string, unknown> = {};
  let purchases = 0; let payments = 0;
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/accounts')) { account = body; return Response.json({ objectCreated: { _id: 'savor-id' } }, { status: 201 }); }
    if (path.endsWith('/withdrawals')) purchases += body.amount;
    else payments += body.amount;
    return Response.json({}, { status: 201 });
  });
  expect(await createNessieAccounts('customer-id', ['Credit Card'], runtime, transport, { card, categories: ['dining', 'groceries'] })).toEqual({});
  expect(transport).toHaveBeenCalledTimes(101);
  expect(account).toEqual({ type: 'Credit Card', nickname: 'Savor · Eno demo', balance: purchases - payments, rewards: purchases });
  expect(Number(account.balance)).toBeGreaterThan(0);
});

it('opens only the chosen accounts and saves 100 Nessie transactions for each', async () => {
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(url)).pathname === '/customers/customer-id/accounts') {
      const body = JSON.parse(String(init?.body));
      return Response.json({ objectCreated: { _id: body.type.toLowerCase() + '-id' } }, { status: 201 });
    }
    return Response.json({ code: 201 }, { status: 201 });
  });
  await createNessieAccounts('customer-id', ['Checking', 'Savings'], runtime, transport);
  expect(transport).toHaveBeenCalledTimes(202);
  const accountCalls = transport.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/customers/customer-id/accounts');
  expect(accountCalls).toHaveLength(2);
  for (const [, init] of accountCalls) {
    const account = JSON.parse(String(init?.body));
    const calls = transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.startsWith(`/accounts/${account.type.toLowerCase()}-id/`));
    let balance = 0; let spending = 0;
    for (const [url, transactionInit] of calls) {
      const amount = JSON.parse(String(transactionInit?.body)).amount;
      if (new URL(String(url)).pathname.endsWith('/deposits')) balance += amount;
      else { balance -= amount; spending += amount; }
    }
    expect(account.balance).toBeGreaterThan(0);
    expect(account.balance).toBe(balance);
    expect(account.rewards).toBe(Math.floor(spending));
  }
  for (const id of ['checking-id', 'savings-id']) {
    expect(transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.startsWith(`/accounts/${id}/`))).toHaveLength(100);
  }
});
it('makes no write requests when no accounts are selected', async () => {
  const transport = vi.fn();
  await expect(createNessieAccounts('customer-id', [], runtime, transport)).resolves.toEqual({});
  expect(transport).not.toHaveBeenCalled();
});
it('stops and reports uncertainty without retrying an account write', async () => {
  const transport = vi.fn(async () => { throw new Error('Failed'); });
  await expect(createNessieAccounts('customer-id', ['Checking', 'Savings'], runtime, transport)).resolves.toHaveProperty('accountError');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('resolves text-only creation acknowledgements before writing demo history', async () => {
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(url)).pathname.startsWith('/customers/')) {
      return init?.method === 'POST' ? new Response('Account created', { status: 201 }) : Response.json([{ _id: 'new-checking', type: 'Checking', nickname: 'Everyday Checking' }]);
    }
    if (init?.method !== 'POST') return Response.json([]);
    return Response.json({ code: 201 }, { status: 201 });
  });
  await expect(createNessieAccounts('customer-id', ['Checking'], runtime, transport)).resolves.toEqual({});
  expect(transport.mock.calls.filter(([url, init]) => init?.method === 'POST' && new URL(String(url)).pathname.startsWith('/accounts/new-checking/'))).toHaveLength(100);
});
