import { expect, it, vi } from 'vitest';
import { NessieClient } from './client';

it('recovers an invalid customer aggregate by reading only its owned Nessie accounts', async () => {
  const transport = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path === '/customers/customer-id/bills') return new Response('Bill validation failed', { status: 400 });
    if (path === '/customers/customer-id/accounts') return Response.json([{ _id: 'owned-a' }, { _id: 'owned-b' }]);
    return Response.json([{ _id: path.includes('owned-a') ? 'bill-a' : 'bill-b', account_id: path.split('/')[2] }]);
  });
  const client = new NessieClient({ apiKey: 'secret', baseUrl: 'https://nessie.test', fetchImpl: transport });
  expect(await client.get('/customers/customer-id/bills')).toEqual([{ _id: 'bill-a', account_id: 'owned-a' }, { _id: 'bill-b', account_id: 'owned-b' }]);
  expect(transport).toHaveBeenCalledTimes(4);
  expect(transport.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/customers/customer-id/bills', '/customers/customer-id/accounts', '/accounts/owned-a/bills', '/accounts/owned-b/bills']);
});
it('does not silently omit an account whose Nessie bills cannot be read', async () => {
  const transport = vi.fn(async (url: RequestInfo | URL) => new URL(String(url)).pathname.endsWith('/accounts') ? Response.json([{ _id: 'owned-a' }]) : new Response('', { status: 400 }));
  const client = new NessieClient({ apiKey: 'secret', baseUrl: 'https://nessie.test', fetchImpl: transport });
  await expect(client.get('/customers/customer-id/bills')).rejects.toThrow('Nessie request failed');
});
