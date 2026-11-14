import { expect, it, vi } from 'vitest';
import { setCustomerRemoved } from './removeCustomer';
import { DELETED_CUSTOMER_PREFIX } from '../../customerDeletion';

const runtime = { NESSIE_API_KEY: 'private-test-key', NESSIE_BASE_URL: 'https://nessie.test' };
it('persists removal in Nessie and restores the original name without changing account data', async () => {
  let record = { _id: 'customer-id', first_name: 'New', last_name: 'Person', address: { city: 'Boston' } };
  const original = structuredClone(record);
  const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') { record = { ...record, ...JSON.parse(String(init.body)) }; return new Response('Accepted', { status: 202 }); }
    return Response.json(record);
  });
  await setCustomerRemoved('customer-id', true, runtime, transport);
  expect(record.first_name).toBe(DELETED_CUSTOMER_PREFIX + 'New');
  const afterRemoval = transport.mock.calls.length;
  await setCustomerRemoved('customer-id', true, runtime, transport);
  expect(transport.mock.calls.length - afterRemoval).toBe(1);
  await setCustomerRemoved('customer-id', false, runtime, transport);
  expect(record).toEqual(original);
  for (const [url, init] of transport.mock.calls) {
    expect(new URL(String(url)).pathname).toBe('/customers/customer-id');
    if (init?.method === 'PUT') expect(Object.keys(JSON.parse(String(init.body)))).toEqual(['first_name']);
  }
});
it('protects Maya Chen and Demo Tester on the server regardless of case or whitespace', async () => {
  for (const [first, last] of [['Maya', 'Chen'], ['  MAYA ', ' CHEN  '], ['Demo', 'Tester']]) {
    const transport = vi.fn(async () => Response.json({ _id: 'protected', first_name: first, last_name: last }));
    await expect(setCustomerRemoved('protected', true, runtime, transport)).rejects.toMatchObject({ status: 403 });
    expect(transport).toHaveBeenCalledOnce();
  }
});
it('rejects failed or unconfirmed writes without claiming the account was removed', async () => {
  const record = { _id: 'customer-id', first_name: 'New', last_name: 'Person' };
  const transport = vi.fn(async () => Response.json(record));
  await expect(setCustomerRemoved('customer-id', true, runtime, transport)).rejects.toMatchObject({ status: 502 });
});
