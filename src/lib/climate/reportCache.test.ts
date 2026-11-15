import { afterEach, expect, it, vi } from 'vitest';
import { buildReport } from './emissions';
import { createClimateReportCache } from './reportCache';

const report = buildReport([], { days: 90 });
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function transport() {
  const fetch = vi.fn(async (url: string) => Response.json({ customer: { id: new URL(url, 'http://localhost').searchParams.get('customer') }, report }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

it('reuses the profile report across remounts, account ordering changes, and page reloads', async () => {
  const store = storage();
  const fetch = transport();
  const cache = createClimateReportCache(() => store);
  await cache.load('ada', ['checking', 'savings']);
  expect(cache.peek('ada', 90, ['savings', 'checking'])).toEqual(report);
  await cache.load('ada', ['savings', 'checking']);
  const reloaded = createClimateReportCache(() => store);
  expect(reloaded.peek('ada')).toEqual(report);
  await reloaded.load('ada', ['checking', 'savings']);
  expect(fetch).toHaveBeenCalledOnce();
});

it('keeps profiles and report windows separate and refreshes after account changes', async () => {
  const fetch = transport();
  const cache = createClimateReportCache(() => storage());
  await cache.load('ada', ['a']);
  expect(cache.peek('maya')).toBeNull();
  await cache.load('maya', ['a']);
  expect(cache.peek('ada', 30)).toBeNull();
  expect(cache.peek('ada', 90, ['a', 'new'])).toBeNull();
  await cache.load('ada', ['a', 'new']);
  await cache.load('ada', ['new']);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('shares in-flight requests even when a widget unmounts before they finish', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  const cache = createClimateReportCache(() => undefined);
  const first = cache.load('ada', ['a']);
  const remounted = cache.load('ada', ['a']);
  expect(fetch).toHaveBeenCalledOnce();
  resolve(Response.json({ customer: { id: 'ada' }, report }));
  expect(await first).toEqual(await remounted);
  await cache.load('ada', ['a']);
  expect(fetch).toHaveBeenCalledOnce();
});

it('does not cache failures or reports belonging to another active profile', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 502 }))
    .mockResolvedValueOnce(Response.json({ customer: { id: 'maya' }, report }))
    .mockResolvedValueOnce(Response.json({ customer: { id: 'ada' }, report }));
  vi.stubGlobal('fetch', fetch);
  const cache = createClimateReportCache(() => undefined);
  await expect(cache.load('ada', ['a'])).rejects.toThrow();
  await expect(cache.load('ada', ['a'])).rejects.toThrow();
  expect(cache.peek('ada')).toBeNull();
  await expect(cache.load('ada', ['a'])).resolves.toEqual(report);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('keeps working when session storage is unavailable or corrupt', async () => {
  const fetch = transport();
  for (const read of [() => { throw new Error('Blocked'); }, () => ({ getItem: () => 'broken JSON', setItem: () => { throw new Error('Full'); } })]) {
    const cache = createClimateReportCache(read);
    await cache.load('ada', ['a']);
    await cache.load('ada', ['a']);
  }
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('a late response for an older account list cannot replace the newer cached report', async () => {
  const responses: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => responses.push(resolve))));
  const cache = createClimateReportCache(() => undefined);
  const old = cache.load('ada', ['a']);
  const current = cache.load('ada', ['a', 'new']);
  responses[1](Response.json({ customer: { id: 'ada' }, report: { ...report, score: 700 } }));
  await current;
  responses[0](Response.json({ customer: { id: 'ada' }, report: { ...report, score: 500 } }));
  await old;
  expect(cache.peek('ada', 90, ['a', 'new'])?.score).toBe(700);
});

it('recovers a forgotten Worker session before retrying the ClimateWise report', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(Response.json({ customer: { id: 'ada' } }))
    .mockResolvedValueOnce(Response.json({ customer: { id: 'ada' }, report }));
  vi.stubGlobal('fetch', fetch);
  const cache = createClimateReportCache(() => undefined);
  await expect(cache.load('ada', ['a'])).resolves.toEqual(report);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/climate?days=90&customer=ada', '/api/session', '/api/climate?days=90&customer=ada']);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ customerId: 'ada' });
});
