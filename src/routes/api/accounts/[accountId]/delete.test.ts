import { afterEach, expect, it, vi } from 'vitest';
import { createSession } from '$lib/server/session';
import { DELETE } from './+server';

vi.mock('$lib/server/env', () => ({
  resolveEnv: () => ({ NESSIE_API_KEY: 'test-key', NESSIE_BASE_URL: 'https://nessie.example' })
}));

const account = { id: 'account-1', nickname: 'Checking', type: 'Checking', balance: 50, rewards: 0, accountNumber: '1234' };
const session = createSession({ id: 'customer-1', firstName: 'Demo', lastName: 'Customer' }, [account]);

function event(accountId = account.id, sessionId: string | null = session.id, origin = 'https://wallet.example') {
  const url = new URL(`https://wallet.example/api/accounts/${accountId}`);
  return {
    request: new Request(url, { method: 'DELETE', headers: { origin } }),
    url,
    params: { accountId },
    cookies: { get: () => sessionId ?? undefined }
  } as unknown as Parameters<typeof DELETE>[0];
}

afterEach(() => {
  session.accounts = [account];
  vi.unstubAllGlobals();
});

it('rejects unsigned, cross-origin, and out-of-session deletions before calling Nessie', async () => {
  const transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  expect((await DELETE(event(account.id, null))).status).toBe(401);
  expect((await DELETE(event(account.id, session.id, 'https://unrelated.example'))).status).toBe(403);
  expect((await DELETE(event('other-account'))).status).toBe(404);
  expect(transport).not.toHaveBeenCalled();
});

it('only removes the account from the session after Nessie confirms deletion', async () => {
  const transport = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', transport);
  expect((await DELETE(event())).status).toBe(502);
  expect(session.accounts).toEqual([account]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect((await DELETE(event())).status).toBe(204);
  expect(session.accounts).toEqual([]);
  expect(transport).toHaveBeenLastCalledWith(
    new URL('https://nessie.example/accounts/account-1?key=test-key'),
    expect.objectContaining({ method: 'DELETE', redirect: 'manual' })
  );
  expect((await DELETE(event())).status).toBe(404);
  expect(transport).toHaveBeenCalledTimes(2);
});
