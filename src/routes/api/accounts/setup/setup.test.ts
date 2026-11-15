import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { continueAccountSetup, AccountSetupError } from '$lib/server/nessie/accountSetup';

vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/nessie/accountSetup', async (original) => ({ ...await original<typeof import('$lib/server/nessie/accountSetup')>(), continueAccountSetup: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
function event(body: unknown = { token: 'signed' }, origin = 'https://eno.money') {
  return { request: new Request('https://eno.money/api/accounts/setup', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), url: new URL('https://eno.money/api/accounts/setup'), platform: undefined } as Parameters<typeof POST>[0];
}
it('rejects missing tokens and cross-origin submissions before running setup', async () => {
  expect((await POST(event({}, 'https://other.test'))).status).toBe(403);
  expect((await POST(event({}))).status).toBe(400);
  expect((await POST(event(null))).status).toBe(400);
  expect(continueAccountSetup).not.toHaveBeenCalled();
});
it('continues across isolates without requiring an in-memory session', async () => {
  vi.mocked(continueAccountSetup).mockResolvedValue({ customerId: 'ada', setupToken: 'next' });
  const response = await POST(event());
  expect(response.status).toBe(202);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ customerId: 'ada', setupToken: 'next' });
  vi.mocked(continueAccountSetup).mockResolvedValue({ customerId: 'ada' });
  expect((await POST(event())).status).toBe(200);
});
it('reports invalid tokens without exposing internal errors', async () => {
  vi.mocked(continueAccountSetup).mockRejectedValue(new AccountSetupError('Setup expired'));
  expect((await POST(event())).status).toBe(409);
  vi.mocked(continueAccountSetup).mockRejectedValue(new Error('secret'));
  const response = await POST(event());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret');
});
