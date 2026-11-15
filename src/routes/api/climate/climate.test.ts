import { expect, it, vi } from 'vitest';
import { GET } from './+server';

function event(requested = 'ada', failure = false) {
  const fetch = vi.fn(async (path: string) => path === '/api/accounts'
    ? Response.json({ customer: { id: 'ada', firstName: 'Ada', lastName: 'Lovelace' }, accounts: [{ id: 'a' }] })
    : failure ? new Response('', { status: 502 }) : Response.json({ transactions: [] }));
  return { fetch, value: { url: new URL(`http://localhost/api/climate?days=90&customer=${requested}`), fetch } as unknown as Parameters<typeof GET>[0] };
}
it('returns the owning customer id alongside the complete report', async () => {
  const response = await GET(event().value);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ customer: { id: 'ada' }, report: { days: 90 } });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('rejects a stale profile request before reading another profile’s transactions', async () => {
  const { value, fetch } = event('maya');
  expect((await GET(value)).status).toBe(409);
  expect(fetch).toHaveBeenCalledOnce();
});
it('does not turn missing account activity into a successful partial score', async () => {
  expect((await GET(event('ada', true).value)).status).toBe(502);
});
