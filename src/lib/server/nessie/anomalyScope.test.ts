import { afterEach, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NessieClient } from './client';
import { registerInsightTools } from './tools/insights';

afterEach(() => vi.useRealTimers());
type Handler = (args: { customerId?: string; accountId?: string; transactionId?: string }) => Promise<{ content: { text: string }[] }>;
function scanner(failCard = false) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  let scan!: Handler;
  const server = { registerTool: (name: string, _schema: unknown, handler: Handler) => { if (name === 'insight_anomalies') scan = handler; } } as unknown as McpServer;
  const rows = [159, 10, 9, 4].map((amount, index) => ({ _id: `coffee-${index}`, description: 'LOCAL COFFEE', amount, transaction_date: `2026-11-${String(index + 1).padStart(2, '0')}`, status: 'completed' }));
  rows.push(...Array.from({ length: 8 }, (_, index) => ({ _id: `other-${index}`, description: `OTHER ${index}`, amount: 20 + index, transaction_date: '2026-11-10', status: 'completed' })));
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/customers/maya/accounts') return Response.json([{ _id: 'checking', type: 'Checking', nickname: 'Test checking' }, { _id: 'card', type: 'Credit Card', nickname: 'Test card' }]);
    if (path === '/accounts/checking') return Response.json({ _id: 'checking', type: 'Checking', nickname: 'Test checking' });
    if (failCard && path.startsWith('/accounts/card/')) return new Response(null, { status: 503 });
    return Response.json(path.endsWith('/withdrawals') ? rows : []);
  });
  registerInsightTools(server, new NessieClient({ apiKey: 'fake', baseUrl: 'https://nessie.test', fetchImpl }));
  return { scan: async (args: Parameters<Handler>[0]) => JSON.parse((await scan(args)).content[0].text), fetchImpl };
}

it('assesses only the referenced transaction while using the full account history for its comparison', async () => {
  const { scan, fetchImpl } = scanner();
  const result = await scan({ customerId: 'maya', accountId: 'checking', transactionId: 'coffee-0' });
  expect(result.findings.map((finding: { _id: string }) => finding._id)).toEqual(['coffee-0']);
  expect(result.assessment).toMatchObject({ found: true, flagged: true, transaction: { _id: 'coffee-0', accountId: 'checking', amount: 159 } });
  expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes('/accounts/card/'))).toBe(true);
  const ordinary = await scan({ accountId: 'checking', transactionId: 'coffee-1' });
  expect(ordinary.findings).toEqual([]);
  expect(ordinary.assessment).toMatchObject({ found: true, flagged: false });
});

it('does not silently treat failed account reads as a clean or complete scan', async () => {
  const { scan } = scanner(true);
  const result = await scan({ customerId: 'maya' });
  expect(result.complete).toBe(false);
  expect(result.failedAccountCount).toBe(1);
  expect(result.findings.some((finding: { _id: string }) => finding._id === 'coffee-0')).toBe(true);
});

it('distinguishes a missing transaction from a clean transaction', async () => {
  const { scan } = scanner();
  const result = await scan({ accountId: 'checking', transactionId: 'unknown' });
  expect(result.assessment.found).toBe(false);
  expect(result.assessment.message).toContain('cannot assess');
});
