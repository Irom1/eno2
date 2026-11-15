import { beforeEach, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const getSession = vi.fn();

vi.mock('$lib/server/session', () => ({
  getSession: (...args: unknown[]) => getSession(...args)
}));
vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/mcp', () => ({
  withMcp: async (_runtime: unknown, fn: (mcp: unknown) => Promise<unknown>) => fn({}),
  callTool: (...args: unknown[]) => callTool(...args)
}));

const { GET } = await import('./+server');

const ada = { id: 'ada', firstName: 'Ada', lastName: 'Lovelace' };
const report = { days: 90, score: 720, tier: 'Good' };

function event(requested?: string) {
  return {
    cookies: { get: () => 'session-id' },
    platform: undefined,
    url: new URL(`http://localhost/api/climate?days=90${requested ? `&customer=${requested}` : ''}`)
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  callTool.mockReset();
  getSession.mockReset();
  getSession.mockReturnValue({ customer: ada, accounts: [] });
  callTool.mockResolvedValue({ ok: true, data: report, text: '' });
});

it('returns the owning customer id alongside the complete report', async () => {
  const response = await GET(event('ada'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ customer: { id: 'ada' }, report: { days: 90 } });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(callTool).toHaveBeenCalledWith(expect.anything(), 'insight_climatewise', {
    customerId: 'ada',
    days: 90
  });
});

it('rejects a stale profile request before reading another profile’s report', async () => {
  const response = await GET(event('maya'));
  expect(response.status).toBe(409);
  expect(callTool).not.toHaveBeenCalled();
});

it('does not turn a failed insight into a successful partial score', async () => {
  callTool.mockResolvedValue({ ok: false, data: null, text: 'boom' });
  expect((await GET(event('ada'))).status).toBe(502);
});

it('requires an active session', async () => {
  getSession.mockReturnValue(undefined);
  expect((await GET(event('ada'))).status).toBe(401);
});
