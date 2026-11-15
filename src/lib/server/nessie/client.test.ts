import { expect, it, vi } from 'vitest';
import { NessieClient } from './client';

it('shares parallel reads so dashboard and ClimateWise do not spend duplicate subrequests', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise((resolve) => { release = resolve; }));
  const client = new NessieClient({ apiKey: 'secret', baseUrl: 'https://nessie.test', fetchImpl });
  const first = client.get('/customers/ada/accounts');
  const repeated = client.get('/customers/ada/accounts');
  expect(fetchImpl).toHaveBeenCalledOnce();
  release(Response.json([]));
  expect(await first).toEqual(await repeated);
  expect(fetchImpl.mock.calls[0][1]?.redirect).toBe('manual');
});

it('clears failed in-flight reads so a later request can recover', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json([]));
  const client = new NessieClient({ apiKey: 'secret', baseUrl: 'https://nessie.test', fetchImpl });
  await expect(client.get('/customers')).rejects.toThrow('401');
  await expect(client.get('/customers')).resolves.toEqual([]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
