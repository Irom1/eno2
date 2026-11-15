import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { verifyAddress } from '$lib/server/address';
import { createNessieCustomer } from '$lib/server/nessie/createCustomer';
import { createNessieAccounts } from '$lib/server/nessie/createAccounts';

vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/address', async (original) => ({ ...await original<typeof import('$lib/server/address')>(), verifyAddress: vi.fn() }));
vi.mock('$lib/server/nessie/createCustomer', async (original) => ({ ...await original<typeof import('$lib/server/nessie/createCustomer')>(), createNessieCustomer: vi.fn() }));
vi.mock('$lib/server/nessie/createAccounts', () => ({ createNessieAccounts: vi.fn() }));

const address = { street_number: '4600', street_name: 'Silver Hill Road', city: 'Washington', state: 'DC', zip: '20233' };
function event(key = crypto.randomUUID(), spending: { status: 'skip' | 'personalize' | 'undecided'; categories: string[] } = { status: 'skip', categories: [] }) {
  return { request: new Request('http://localhost/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ first_name: 'Demo', last_name: 'Tester', address, accountChoice: 'both', spending, includeCreditCard: spending.status === 'personalize' }) }), cookies: { set: vi.fn() }, platform: undefined } as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => vi.resetAllMocks());

it('includes only the related demo credit card after spending preferences are resolved', async () => {
  vi.mocked(verifyAddress).mockResolvedValue({ status: 'matched', message: 'Matched', address });
  vi.mocked(createNessieCustomer).mockResolvedValue({ customerId: 'created-demo' });
  vi.mocked(createNessieAccounts).mockResolvedValue({});
  expect((await POST(event(crypto.randomUUID(), { status: 'undecided', categories: [] }))).status).toBe(400);
  expect(createNessieCustomer).not.toHaveBeenCalled();
  expect((await POST(event(crypto.randomUUID(), { status: 'personalize', categories: ['travel', 'dining'] }))).status).toBe(201);
  expect(vi.mocked(createNessieAccounts).mock.calls[0][1]).toEqual(['Checking', 'Savings', 'Credit Card']);
  expect(vi.mocked(createNessieAccounts).mock.calls[0][4]).toMatchObject({ card: { id: 'venture', nickname: 'Venture Rewards · Eno demo' }, categories: ['travel', 'dining'] });
});

it('blocks all Nessie writes if the address does not match or needs correction', async () => {
  for (const status of ['not_found', 'correction'] as const) {
    vi.mocked(verifyAddress).mockResolvedValue({ status, message: 'Check your address.' });
    expect((await POST(event())).status).toBe(422);
  }
  expect(createNessieCustomer).not.toHaveBeenCalled();
  expect(createNessieAccounts).not.toHaveBeenCalled();
});
it('allows a safe retry after address verification is unavailable', async () => {
  const key = crypto.randomUUID();
  vi.mocked(verifyAddress).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 'matched', message: 'Matched', address });
  vi.mocked(createNessieCustomer).mockResolvedValue({ customerId: 'created-demo' });
  vi.mocked(createNessieAccounts).mockResolvedValue({});
  expect((await POST(event(key))).status).toBe(503);
  expect(createNessieCustomer).not.toHaveBeenCalled();
  expect((await POST(event(key))).status).toBe(201);
  expect(createNessieCustomer).toHaveBeenCalledOnce();
});
it('creates from the matched address and keeps repeat submissions idempotent', async () => {
  const key = crypto.randomUUID();
  const standardized = { ...address, street_name: 'SILVER HILL RD' };
  vi.mocked(verifyAddress).mockResolvedValue({ status: 'matched', message: 'Matched', address: standardized });
  vi.mocked(createNessieCustomer).mockResolvedValue({ customerId: 'created-demo' });
  vi.mocked(createNessieAccounts).mockResolvedValue({});
  expect((await POST(event(key))).status).toBe(201);
  expect((await POST(event(key))).status).toBe(201);
  expect(createNessieCustomer).toHaveBeenCalledExactlyOnceWith({ first_name: 'Demo', last_name: 'Tester', address: standardized }, {});
  expect(createNessieAccounts).toHaveBeenCalledExactlyOnceWith('created-demo', ['Checking', 'Savings'], {}, undefined, { card: null, categories: [] });
});

it('returns the confirmed profile and continuation before sample activity is seeded', async () => {
  vi.mocked(verifyAddress).mockResolvedValue({ status: 'matched', message: 'Matched', address });
  vi.mocked(createNessieCustomer).mockResolvedValue({ customerId: 'created-demo' });
  vi.mocked(createNessieAccounts).mockResolvedValue({ setupToken: 'signed-setup' });
  const response = await POST(event());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ customerId: 'created-demo', created: true, setupToken: 'signed-setup' });
});

it('retains the confirmed profile if subsequent account setup throws', async () => {
  vi.mocked(verifyAddress).mockResolvedValue({ status: 'matched', message: 'Matched', address });
  vi.mocked(createNessieCustomer).mockResolvedValue({ customerId: 'created-demo' });
  vi.mocked(createNessieAccounts).mockRejectedValue(new Error('Setup failed'));
  const response = await POST(event());
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ customerId: 'created-demo', created: true, accountError: expect.any(String) });
});
