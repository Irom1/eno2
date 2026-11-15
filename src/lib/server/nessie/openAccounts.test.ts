import { expect, it, vi } from 'vitest';
import { openExistingAccounts, readAccountOpeningState } from './openAccounts';
import { continueAccountSetup } from './accountSetup';
import { detectDuplicateCharges, detectOutliers, toTransaction } from './tools/insights';

const runtime = { NESSIE_API_KEY: 'test-key', NESSIE_BASE_URL: 'https://nessie.test' };
function nessie(initial: Record<string, unknown>[] = []) {
  const customerId = crypto.randomUUID();
  const accounts = [...initial];
  const saved = new Map<string, Record<string, unknown>[]>();
  let uncertain = false;
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST') {
      if (path === `/customers/${customerId}/accounts`) {
        if (uncertain) throw new Error('Lost acknowledgement');
        const account = { ...JSON.parse(String(init.body)), _id: crypto.randomUUID(), customer_id: customerId };
        accounts.push(account);
        return Response.json({ objectCreated: account }, { status: 201 });
      }
      const rows = saved.get(path) ?? [];
      rows.push({ ...JSON.parse(String(init.body)), _id: crypto.randomUUID() });
      saved.set(path, rows);
      return Response.json({ code: 201 }, { status: 201 });
    }
    if (path === `/customers/${customerId}`) return Response.json({ _id: customerId, first_name: 'Ada', last_name: 'Lovelace' });
    if (path === `/customers/${customerId}/accounts`) return Response.json(accounts);
    if (path.startsWith('/accounts/')) return Response.json(saved.get(path) ?? []);
    throw new Error(`Unexpected path ${path}`);
  });
  return { customerId, accounts, saved, transport, loseAcknowledgement: () => { uncertain = true; } };
}

it.each(['together', 'separately', 'while setup is pending'] as const)('keeps all six products within the shared profile limits when opened %s', async (mode) => {
  const fake = nessie();
  const finish = async (token?: string) => {
    for (let step = 0; token && step < 60; step++) {
      const result = await continueAccountSetup(token, runtime, fake.transport);
      expect(result.accountError).toBeUndefined();
      token = result.setupToken;
    }
    expect(token).toBeUndefined();
  };
  if (mode === 'together') {
    const result = await openExistingAccounts(fake.customerId, ['checking', 'savings', 'savor', 'venture', 'quicksilver', 'discover'], crypto.randomUUID(), runtime, fake.transport);
    await finish(result.setupToken);
  } else {
    const first = await openExistingAccounts(fake.customerId, ['checking', 'savings'], crypto.randomUUID(), runtime, fake.transport);
    if (mode === 'separately') await finish(first.setupToken);
    const second = await openExistingAccounts(fake.customerId, ['savor', 'venture', 'quicksilver', 'discover'], crypto.randomUUID(), runtime, fake.transport);
    await finish(second.setupToken);
    if (mode === 'while setup is pending') await finish(first.setupToken);
  }
  expect(fake.accounts).toHaveLength(6);
  let totalOutliers = 0, totalDuplicates = 0;
  for (const account of fake.accounts) {
    const rows = fake.saved.get(`/accounts/${account._id}/withdrawals`)!;
    expect(rows).toHaveLength(50);
    const posted = rows.flatMap((row) => toTransaction(row, 'withdrawal') ?? []);
    const outliers = detectOutliers(posted, new Date());
    const duplicates = detectDuplicateCharges(posted);
    expect(outliers.length).toBeLessThanOrEqual(2);
    expect(duplicates.length).toBeLessThanOrEqual(1);
    totalOutliers += outliers.length;
    totalDuplicates += duplicates.length;
  }
  expect(totalOutliers).toBe(5);
  expect(totalDuplicates).toBe(3);
});

it('adds multiple remaining products to the existing customer with 100 persisted transactions each', async () => {
  const fake = nessie([{ _id: 'existing', type: 'Checking', nickname: 'Everyday Checking', balance: 900 }]);
  const before = await readAccountOpeningState(fake.customerId, runtime, fake.transport);
  expect(before.available.some((option) => option.id === 'checking')).toBe(false);
  const result = await openExistingAccounts(fake.customerId, ['savings', 'savor', 'venture'], crypto.randomUUID(), runtime, fake.transport);
  let setup = result;
  for (let step = 0; setup.setupToken && step < 60; step++) setup = await continueAccountSetup(setup.setupToken, runtime, fake.transport);
  expect(setup.accountError).toBeUndefined();
  expect(setup.setupToken).toBeUndefined();
  expect(result.accounts).toHaveLength(4);
  expect(fake.accounts[0].balance).toBe(900);
  for (const account of fake.accounts.slice(1)) {
    const prefix = `/accounts/${account._id}`;
    const deposits = fake.saved.get(`${prefix}/deposits`) ?? [];
    const withdrawals = fake.saved.get(`${prefix}/withdrawals`) ?? [];
    expect(deposits.length + withdrawals.length).toBe(100);
    expect([...deposits, ...withdrawals].some((row) => row.status === 'pending')).toBe(true);
    expect(fake.saved.get(`${prefix}/bills`)).toHaveLength(3);
    expect(fake.saved.get(`${prefix}/loans`)).toHaveLength(1);
    const total = (rows: Record<string, unknown>[]) => rows.filter((row) => row.status === 'completed').reduce((sum, row) => sum + Number(row.amount), 0);
    const purchases = total(withdrawals), payments = total(deposits);
    const balance = account.type === 'Credit Card' ? purchases - payments : payments - purchases;
    expect(account.balance).toBeCloseTo(balance, 2);
    expect(account.rewards).toBe(account.type === 'Credit Card' ? Math.floor(purchases) : 0);
    expect(Number(account.balance)).toBeGreaterThan(0);
  }
  const writes = fake.transport.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(315);
  expect(writes.some(([url]) => new URL(String(url)).pathname === '/customers')).toBe(false);
  const after = await readAccountOpeningState(fake.customerId, runtime, fake.transport);
  expect(after.available.map((option) => option.id)).toEqual(['quicksilver', 'discover']);
});

it('rejects the entire stale selection before writing when any selected product is already owned', async () => {
  const fake = nessie([{ _id: 'existing', type: 'Credit Card', nickname: 'Venture Rewards' }]);
  await expect(openExistingAccounts(fake.customerId, ['checking', 'venture'], crypto.randomUUID(), runtime, fake.transport)).rejects.toMatchObject({ status: 409 });
  expect(fake.transport.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});

it('deduplicates concurrent repeated submissions and rejects parallel requests with another key', async () => {
  const fake = nessie();
  const key = crypto.randomUUID();
  const first = openExistingAccounts(fake.customerId, ['checking'], key, runtime, fake.transport);
  const repeated = openExistingAccounts(fake.customerId, ['checking'], key, runtime, fake.transport);
  await expect(openExistingAccounts(fake.customerId, ['checking'], crypto.randomUUID(), runtime, fake.transport)).rejects.toMatchObject({ status: 409 });
  expect(await first).toEqual(await repeated);
  await openExistingAccounts(fake.customerId, ['checking'], key, runtime, fake.transport);
  expect(fake.accounts).toHaveLength(1);
  await expect(openExistingAccounts(fake.customerId, ['checking'], crypto.randomUUID(), runtime, fake.transport)).rejects.toMatchObject({ status: 409 });
  await expect(openExistingAccounts(fake.customerId, ['savings'], key, runtime, fake.transport)).rejects.toMatchObject({ status: 409 });
});

it('retains an uncertain write outcome without automatically repeating the write', async () => {
  const fake = nessie(); fake.loseAcknowledgement();
  const key = crypto.randomUUID();
  expect(await openExistingAccounts(fake.customerId, ['checking', 'savings'], key, runtime, fake.transport)).toHaveProperty('accountError');
  await openExistingAccounts(fake.customerId, ['checking', 'savings'], key, runtime, fake.transport);
  expect(fake.transport.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
