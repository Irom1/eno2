import { afterEach, expect, it, vi } from 'vitest';
import { closeNessieProfile, isClosedProfile } from './closeProfile';

afterEach(() => vi.unstubAllGlobals());

it('keeps a profile available after partial account deletion and closes it on retry', async () => {
  const accounts = new Set(['checking', 'savings']);
  let rejectSavingsDelete = true;
  let profile: Record<string, unknown> = { first_name: 'Demo', last_name: 'Customer' };
  const transport = vi.fn(async (url: URL, init: RequestInit) => {
    if (url.pathname === '/customers/demo/accounts') {
      return Response.json([...accounts].map((_id) => ({ _id })));
    }
    if (init.method === 'DELETE') {
      const id = url.pathname.split('/').at(-1)!;
      if (id === 'savings' && rejectSavingsDelete) return new Response(null, { status: 503 });
      accounts.delete(id);
      return new Response(null, { status: 204 });
    }
    if (init.method === 'PUT') {
      expect(accounts.size).toBe(0);
      profile = JSON.parse(String(init.body));
      return new Response(null, { status: 202 });
    }
    return Response.json(profile);
  });
  vi.stubGlobal('fetch', transport);
  const runtime = {
    NESSIE_API_KEY: 'test-key',
    NESSIE_BASE_URL: 'https://nessie.example',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    LLM: 'mock' as const
  };

  await expect(closeNessieProfile('demo', runtime)).rejects.toThrow('Could not delete all accounts');
  expect([...accounts]).toEqual(['savings']);
  expect(profile.first_name).toBe('Demo');

  rejectSavingsDelete = false;
  await expect(closeNessieProfile('demo', runtime)).resolves.toBeUndefined();
  expect(isClosedProfile({
    firstName: String(profile.first_name),
    lastName: String(profile.last_name),
    address: profile.address as { zip?: string }
  })).toBe(true);
  expect(transport.mock.calls.filter(([url]) => url.pathname === '/accounts/checking')).toHaveLength(1);
});
