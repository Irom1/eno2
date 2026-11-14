import { expect, it, vi } from 'vitest';
import { buildDemoObligations, seedNessieObligations } from './seedObligations';

const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };
it('writes upcoming bills and a loan to the selected Nessie account', async () => {
  const transport = vi.fn(async () => Response.json({}, { status: 201 }));
  expect(await seedNessieObligations('account-id', 'Checking', 15000, runtime, transport)).toEqual({ bills: 3, loans: 1, complete: true });
  const calls = transport.mock.calls as unknown as [RequestInfo | URL, RequestInit][];
  expect(calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/accounts/account-id/bills', '/accounts/account-id/bills', '/accounts/account-id/bills', '/accounts/account-id/loans']);
  expect(calls.every(([, init]) => init.method === 'POST')).toBe(true);
  expect(JSON.parse(String(calls[3][1].body))).toMatchObject({ type: 'auto', status: 'approved', amount: 12000, monthly_payment: 285 });
});
it('uses future dates across month/year boundaries and preserves recurring bill dates', () => {
  const { bills } = buildDemoObligations('Credit Card', 8000, new Date('2026-12-29T12:00:00Z'));
  expect(bills[0]).toMatchObject({ payment_date: '2027-01-03', payment_amount: 240 });
  expect(bills[2]).toMatchObject({ payment_date: '2027-01-18', recurring_date: 18 });
  for (const bill of bills) {
    expect(bill.status).toBe('recurring');
    expect(bill).not.toHaveProperty('creation_date');
    expect(bill).not.toHaveProperty('upcoming_payment_date');
    expect(bill.recurring_date).toBeGreaterThanOrEqual(1);
  }
});
it('reports partial records without retrying an uncertain write', async () => {
  const transport = vi.fn(async () => new Response('', { status: 503 }));
  expect(await seedNessieObligations('account-id', 'Savings', 7000, runtime, transport)).toEqual({ bills: 0, loans: 0, complete: false });
  expect(transport).toHaveBeenCalledOnce();
});
