import { expect, it, vi } from 'vitest';
import { finishAccountSetup } from './accountSetup';

it('waits for every continuation before reporting completion', async () => {
  const transport = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ customerId: 'ada', setupToken: 'next' }, { status: 202 }))
    .mockResolvedValueOnce(Response.json({ customerId: 'ada' }));
  expect(await finishAccountSetup({ customerId: 'ada', setupToken: 'first' }, transport)).toEqual({ customerId: 'ada', setupToken: undefined, accountError: undefined });
  expect(transport.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).token)).toEqual(['first', 'next']);
});

it('keeps the confirmed profile after a network failure without retrying', async () => {
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('Lost acknowledgement'));
  const result = await finishAccountSetup({ customerId: 'ada', setupToken: 'first' }, transport);
  expect(result).toMatchObject({ customerId: 'ada', accountError: expect.any(String), setupToken: undefined });
  expect(transport).toHaveBeenCalledOnce();
});

it('stops if continuation returns another profile or an HTTP failure', async () => {
  for (const response of [Response.json({ customerId: 'other' }), Response.json({ error: 'expired' }, { status: 409 })]) {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await finishAccountSetup({ customerId: 'ada', setupToken: 'first' }, transport)).toMatchObject({ customerId: 'ada', accountError: expect.any(String) });
    expect(transport).toHaveBeenCalledOnce();
  }
});
