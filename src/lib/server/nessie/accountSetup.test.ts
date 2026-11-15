import { expect, it, vi } from 'vitest';
import { continueAccountSetup, signAccountSetup, type AccountSetupPlan } from './accountSetup';

const runtime = { NESSIE_API_KEY: 'setup-test-secret', NESSIE_BASE_URL: 'https://nessie.test' };
const plan: AccountSetupPlan = { accountId: 'checking-id', type: 'Checking', seed: 'customer:Checking', date: '2026-11-15T12:00:00Z', categories: [] };
const token = () => signAccountSetup({ customerId: 'customer', plans: [plan], expires: Date.now() + 60_000 }, runtime);

function nessie() {
  const saved = new Map<string, object[]>();
  const bodies: Response[] = [];
  let requests = 0, maximum = 0, failAfterSave = false;
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    maximum = Math.max(maximum, ++requests);
    if (requests > 50) throw new Error('Too many subrequests');
    const path = new URL(String(url)).pathname;
    if (init?.method !== 'POST') return Response.json(saved.get(path) ?? []);
    saved.set(path, [...saved.get(path) ?? [], JSON.parse(String(init.body))]);
    if (failAfterSave) { failAfterSave = false; throw new Error('Acknowledgement lost'); }
    const response = Response.json({ code: 201 }, { status: 201 });
    bodies.push(response);
    return response;
  });
  return { saved, bodies, transport, maximum: () => maximum, nextRequest: () => { requests = 0; }, loseAcknowledgement: () => { failAfterSave = true; } };
}

it('finishes below the Worker budget, verifies saved records, and safely replays a completed token', async () => {
  const fake = nessie();
  const original = await token();
  let result: Awaited<ReturnType<typeof continueAccountSetup>> = { customerId: 'customer', setupToken: original };
  for (let step = 0; result.setupToken && step < 15; step++) {
    fake.nextRequest();
    result = await continueAccountSetup(result.setupToken, runtime, fake.transport);
    expect(result.accountError).toBeUndefined();
  }
  expect(result).toEqual({ customerId: 'customer' });
  expect(fake.maximum()).toBeLessThanOrEqual(24);
  expect(fake.saved.get('/accounts/checking-id/deposits')).toHaveLength(50);
  expect(fake.saved.get('/accounts/checking-id/withdrawals')).toHaveLength(50);
  expect(fake.saved.get('/accounts/checking-id/bills')).toHaveLength(3);
  expect(fake.saved.get('/accounts/checking-id/loans')).toHaveLength(1);
  expect(fake.bodies.every((response) => response.bodyUsed)).toBe(true);
  const writes = fake.bodies.length;
  fake.nextRequest();
  expect(await continueAccountSetup(original, runtime, fake.transport)).toEqual({ customerId: 'customer' });
  expect(fake.bodies).toHaveLength(writes);
});

it('stops on a lost acknowledgement and reads saved records before a later continuation', async () => {
  const fake = nessie();
  const original = await token();
  fake.loseAcknowledgement();
  expect(await continueAccountSetup(original, runtime, fake.transport)).toMatchObject({ customerId: 'customer', accountError: expect.any(String) });
  expect(fake.saved.get('/accounts/checking-id/deposits')).toHaveLength(1);
  fake.nextRequest();
  expect(await continueAccountSetup(original, runtime, fake.transport)).toHaveProperty('setupToken');
  const deposits = fake.saved.get('/accounts/checking-id/deposits')!;
  expect(deposits).toHaveLength(21);
  expect(deposits.filter((row) => (row as { description: string }).description === 'DEMO OPENING DEPOSIT')).toHaveLength(1);
});

it('rejects tampered, expired, and differently signed tokens before accessing Nessie', async () => {
  const transport = vi.fn();
  const original = await token();
  const expired = await signAccountSetup({ customerId: 'customer', plans: [plan], expires: Date.now() - 1 }, runtime);
  for (const value of [original.replace(/^./, 'x'), original + '.extra', expired, 'invalid']) {
    await expect(continueAccountSetup(value, runtime, transport)).rejects.toThrow('could not be verified');
  }
  await expect(continueAccountSetup(original, { ...runtime, NESSIE_API_KEY: 'different' }, transport)).rejects.toThrow('could not be verified');
  expect(transport).not.toHaveBeenCalled();
});

it('does not turn failed reads into writes or expose server credentials', async () => {
  const transport = vi.fn(async () => new Response('', { status: 503 }));
  const result = await continueAccountSetup(await token(), runtime, transport);
  expect(result.accountError).toBeTruthy();
  expect(JSON.stringify(result)).not.toContain(runtime.NESSIE_API_KEY);
  expect(transport).toHaveBeenCalledTimes(2);
});
