import { expect, it, vi } from 'vitest';
import { createNessieAccounts } from './createAccounts';
const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };

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
  expect(accountCalls.map(([url, init]) => [new URL(String(url)).pathname, JSON.parse(String(init?.body))])).toEqual([
    ['/customers/customer-id/accounts', { type: 'Checking', nickname: 'Everyday Checking', balance: 0, rewards: 0 }],
    ['/customers/customer-id/accounts', { type: 'Savings', nickname: 'My Savings', balance: 0, rewards: 0 }]
  ]);
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
    return Response.json({ code: 201 }, { status: 201 });
  });
  await expect(createNessieAccounts('customer-id', ['Checking'], runtime, transport)).resolves.toEqual({});
  expect(transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.startsWith('/accounts/new-checking/'))).toHaveLength(100);
});
