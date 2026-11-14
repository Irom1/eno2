import { describe, expect, it, vi } from 'vitest';
import { customerCreateSchema } from '../../signup';
import { createNessieCustomer } from './createCustomer';

const input = {
  first_name: 'Ada', last_name: 'Lovelace',
  address: { street_number: '123', street_name: 'Main Street', city: 'Boston', state: 'MA', zip: '02139' }
};
const runtime = { NESSIE_API_KEY: 'test-secret', NESSIE_BASE_URL: 'https://nessie.test' };

describe('Nessie signup', () => {
  it('validates every required address field and preserves leading ZIP zeroes', () => {
    expect(customerCreateSchema.parse({ ...input, first_name: ' Ada ' }).first_name).toBe('Ada');
    expect(customerCreateSchema.parse(input).address.zip).toBe('02139');
    expect(customerCreateSchema.safeParse({ ...input, address: { ...input.address, state: 'ZZ' } }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...input, address: { ...input.address, street_number: '' } }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...input, address: { ...input.address, zip: '123' } }).success).toBe(false);
  });

  it('creates only a customer, without opening or funding any accounts', async () => {
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      return Response.json(init?.method === 'POST' ? { objectCreated: { _id: 'new-customer', ...input } } : [], { status: init?.method === 'POST' ? 201 : 200 });
    });
    await expect(createNessieCustomer(input, runtime, transport)).resolves.toEqual({ customerId: 'new-customer' });
    expect(transport).toHaveBeenCalledTimes(2);
    const [url, options] = transport.mock.calls[1];
    expect(new URL(String(url)).pathname).toBe('/customers');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual(input);
    expect(options?.redirect).toBe('error');
  });

  it('finds the newly created ID after a text-only acknowledgement, even with an older namesake', async () => {
    let reads = 0;
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response('Customer created', { status: 201 });
      reads += 1;
      return Response.json(reads === 1 ? [{ _id: 'old', ...input }] : [{ _id: 'old', ...input }, { _id: 'new', ...input }]);
    });
    await expect(createNessieCustomer(input, runtime, transport)).resolves.toEqual({ customerId: 'new' });
  });

  it('never retries a write or exposes the API key when the result is uncertain', async () => {
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') throw new Error('network error at https://nessie.test?key=test-secret');
      return Response.json([]);
    });
    try { await createNessieCustomer(input, runtime, transport); throw new Error('Expected failure'); }
    catch (error) { expect(error).toMatchObject({ mayBeCreated: true }); expect(String(error)).not.toContain('test-secret'); }
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
