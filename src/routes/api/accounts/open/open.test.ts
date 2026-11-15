import { beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from './+server';
import { createSession, clearSessions } from '$lib/server/session';
import { openExistingAccounts, readAccountOpeningState } from '$lib/server/nessie/openAccounts';

vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/nessie/openAccounts', async (original) => ({ ...await original<typeof import('$lib/server/nessie/openAccounts')>(), openExistingAccounts: vi.fn(), readAccountOpeningState: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); clearSessions(); });
function event(customerId: string | null = 'ada', body: unknown = { customerId: 'ada', products: ['checking'] }, origin = 'http://localhost') {
  const session = customerId ? createSession({ id: customerId, firstName: 'Ada', lastName: 'Lovelace' }, []) : null;
  return { session, value: { request: new Request('http://localhost/api/accounts/open', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) }), url: new URL('http://localhost/api/accounts/open'), cookies: { get: () => session?.id }, platform: undefined } as unknown as Parameters<typeof POST>[0] };
}
it('requires a customer session and refuses writes to another active profile', async () => {
  expect((await GET(event(null).value)).status).toBe(401);
  expect((await POST(event(null).value)).status).toBe(401);
  expect((await POST(event('guest').value)).status).toBe(403);
  expect((await POST(event('other').value)).status).toBe(409);
  expect((await POST(event('ada', undefined, 'https://other.test').value)).status).toBe(403);
  expect(openExistingAccounts).not.toHaveBeenCalled();
});
it('rejects malformed and duplicate selections before creating anything', async () => {
  for (const products of [[], ['checking', 'checking'], ['fake']]) expect((await POST(event('ada', { customerId: 'ada', products }).value)).status).toBe(400);
  expect(openExistingAccounts).not.toHaveBeenCalled();
});
it('returns available products only for the requested active customer', async () => {
  vi.mocked(readAccountOpeningState).mockResolvedValue({ customer: { id: 'ada', firstName: 'Ada', lastName: 'Lovelace' }, accounts: [], available: [] });
  const value = event().value;
  value.url.searchParams.set('customer', 'other');
  expect((await GET(value)).status).toBe(409);
  value.url.searchParams.set('customer', 'ada');
  expect(await (await GET(value)).json()).toEqual({ customer: { id: 'ada', firstName: 'Ada', lastName: 'Lovelace' }, available: [] });
});
it('refreshes session account ownership after creation and reports partial outcomes', async () => {
  const { session, value } = event();
  const account = { id: 'new', type: 'Checking', nickname: '360 Checking', balance: 100, rewards: 20, accountNumber: '', customerId: 'ada' };
  vi.mocked(openExistingAccounts).mockResolvedValue({ customerId: 'ada', accounts: [account] });
  expect((await POST(value)).status).toBe(201);
  expect(session?.accounts).toEqual([account]);
  vi.mocked(openExistingAccounts).mockResolvedValue({ customerId: 'ada', accountError: 'Some demo activity is missing.' });
  expect((await POST(event().value)).status).toBe(202);
});
