import { expect, it, vi } from 'vitest';
import { createNessieAccounts } from './createAccounts';
const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };

it('opens only the chosen demo accounts, with no initial money or rewards', async () => {
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ code: 201 }, { status: 201 }));
  await createNessieAccounts('customer-id', ['Checking', 'Savings'], runtime, transport);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, JSON.parse(String(init?.body))])).toEqual([
    ['/customers/customer-id/accounts', { type: 'Checking', nickname: 'Everyday Checking', balance: 0, rewards: 0 }],
    ['/customers/customer-id/accounts', { type: 'Savings', nickname: 'My Savings', balance: 0, rewards: 0 }]
  ]);
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
