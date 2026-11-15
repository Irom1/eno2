import { expect, it, vi } from 'vitest';
import { createNessieAccounts as beginNessieAccounts } from './createAccounts';
import { continueAccountSetup } from './accountSetup';
import { recommendDemoCard } from '../../spending';
import { detectDuplicateCharges, detectOutliers, toTransaction } from './tools/insights';
const runtime = { NESSIE_API_KEY: 'secret', NESSIE_BASE_URL: 'https://nessie.test' };

// Model separate HTTP invocations and persist records between them. Every
// invocation gets the same hard 50-subrequest budget as Workers Free.
async function createNessieAccounts(...args: Parameters<typeof beginNessieAccounts>) {
  const original = args[3]!;
  const saved = new Map<string, object[]>();
  let requests = 0;
  const transport: typeof fetch = async (url, init) => {
    if (++requests > 50) throw new Error('Too many subrequests');
    const path = new URL(String(url)).pathname;
    if (init?.method !== 'POST' && path.startsWith('/accounts/')) return Response.json(saved.get(path) ?? []);
    const response = await original(url, init);
    if (init?.method === 'POST' && path.startsWith('/accounts/') && response.ok) {
      saved.set(path, [...saved.get(path) ?? [], JSON.parse(String(init.body))]);
    }
    return response;
  };
  let result = await beginNessieAccounts(args[0], args[1], args[2], transport, args[4]);
  for (let step = 0; result.setupToken && step < 60; step++) {
    requests = 0;
    result = await continueAccountSetup(result.setupToken, args[2], transport);
  }
  expect(result.setupToken).toBeUndefined();
  return result.accountError ? { accountError: result.accountError } : {};
}

function expectReviewableCharges(bodies: unknown[]) {
  const posted = bodies.map((body, index) => toTransaction({ ...body as object, _id: String(index) }, 'withdrawal')).filter((item) => item !== null);
  const suspicious = detectOutliers(posted, new Date()).filter((finding) =>
    posted.some((item) => item.id !== finding._id && item.description === finding.description && item.amount < 100 && item.amount * 4 < finding.amount));
  expect(suspicious).toHaveLength(2);
  expect(detectDuplicateCharges(posted)).toHaveLength(1);
}

it('persists the matching credit card and its exact transaction-derived balance and points', async () => {
  const card = recommendDemoCard({ status: 'personalize', categories: ['dining', 'groceries'] })!;
  let account: Record<string, unknown> = {};
  let purchases = 0; let payments = 0;
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/accounts')) { account = body; return Response.json({ objectCreated: { _id: 'savor-id' } }, { status: 201 }); }
    if (body.status === 'completed') {
      if (path.endsWith('/withdrawals')) purchases += body.amount;
      else if (path.endsWith('/deposits')) payments += body.amount;
    }
    return Response.json({}, { status: 201 });
  });
  expect(await createNessieAccounts('customer-id', ['Credit Card'], runtime, transport, { card, categories: ['dining', 'groceries'] })).toEqual({});
  expect(transport).toHaveBeenCalledTimes(105);
  expect(account).toEqual({ type: 'Credit Card', nickname: 'Savor · Eno demo', balance: purchases - payments, rewards: purchases });
  expect(Number(account.balance)).toBeGreaterThan(0);
  expectReviewableCharges(transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/withdrawals')).map(([, init]) => JSON.parse(String(init?.body))));
});

it('opens only the chosen accounts and saves 100 Nessie transactions for each', async () => {
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(url)).pathname === '/customers/customer-id/accounts') {
      const body = JSON.parse(String(init?.body));
      return Response.json({ objectCreated: { _id: body.type.toLowerCase() + '-id' } }, { status: 201 });
    }
    return Response.json({ code: 201 }, { status: 201 });
  });
  await createNessieAccounts('customer-id', ['Checking', 'Savings'], runtime, transport);
  expect(transport).toHaveBeenCalledTimes(210);
  const accountCalls = transport.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/customers/customer-id/accounts');
  expect(accountCalls).toHaveLength(2);
  for (const [, init] of accountCalls) {
    const account = JSON.parse(String(init?.body));
    expect(account.nickname).toBe(account.type === 'Checking' ? '360 Checking' : '360 Performance Savings');
    const calls = transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.startsWith(`/accounts/${account.type.toLowerCase()}-id/`) && /\/(?:deposits|withdrawals)$/.test(new URL(String(url)).pathname));
    let balance = 0; let spending = 0;
    for (const [url, transactionInit] of calls) {
      const transaction = JSON.parse(String(transactionInit?.body));
      if (transaction.status !== 'completed') continue;
      const amount = transaction.amount;
      if (new URL(String(url)).pathname.endsWith('/deposits')) balance += amount;
      else { balance -= amount; spending += amount; }
    }
    expect(account.balance).toBeGreaterThan(0);
    expect(account.balance).toBe(balance);
    expect(account.rewards).toBe(Math.floor(spending));
    expectReviewableCharges(calls.filter(([url]) => new URL(String(url)).pathname.endsWith('/withdrawals')).map(([, init]) => JSON.parse(String(init?.body))));
  }
  for (const id of ['checking-id', 'savings-id']) {
    expect(transport.mock.calls.filter(([url]) => new URL(String(url)).pathname.startsWith(`/accounts/${id}/`) && /\/(?:deposits|withdrawals)$/.test(new URL(String(url)).pathname))).toHaveLength(100);
  }
});
it('makes no write requests when no accounts are selected', async () => {
  const transport = vi.fn();
  await expect(createNessieAccounts('customer-id', [], runtime, transport)).resolves.toEqual({});
  expect(transport).not.toHaveBeenCalled();
});
it('shares the five-charge and three-duplicate allowance across signup accounts and setup continuations', async () => {
  const card = recommendDemoCard({ status: 'personalize', categories: ['travel'] })!;
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(url)).pathname.endsWith('/accounts')) {
      const body = JSON.parse(String(init?.body));
      return Response.json({ objectCreated: { _id: body.type.replaceAll(' ', '-') } }, { status: 201 });
    }
    return Response.json({}, { status: 201 });
  });
  expect(await createNessieAccounts('signup-profile', ['Checking', 'Savings', 'Credit Card'], runtime, transport, { card, categories: ['travel'] })).toEqual({});
  let totalOutliers = 0, totalDuplicates = 0;
  for (const type of ['Checking', 'Savings', 'Credit-Card']) {
    const rows = transport.mock.calls.filter(([url]) => new URL(String(url)).pathname === `/accounts/${type}/withdrawals`)
      .map(([, init], id) => ({ ...JSON.parse(String(init?.body)), _id: String(id) }));
    expect(rows).toHaveLength(50);
    const posted = rows.flatMap((row) => toTransaction(row, 'withdrawal') ?? []);
    const outliers = detectOutliers(posted, new Date());
    const duplicates = detectDuplicateCharges(posted);
    expect(outliers).toHaveLength(type === 'Credit-Card' ? 1 : 2);
    expect(duplicates).toHaveLength(1);
    totalOutliers += outliers.length;
    totalDuplicates += duplicates.length;
  }
  expect(totalOutliers).toBe(5);
  expect(totalDuplicates).toBe(3);
});
it('stops and reports uncertainty without retrying an account write', async () => {
  const transport = vi.fn(async () => { throw new Error('Failed'); });
  await expect(createNessieAccounts('customer-id', ['Checking', 'Savings'], runtime, transport)).resolves.toHaveProperty('accountError');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('resolves text-only creation acknowledgements before writing demo history', async () => {
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(url)).pathname.startsWith('/customers/')) {
      return init?.method === 'POST' ? new Response('Account created', { status: 201 }) : Response.json([{ _id: 'new-checking', type: 'Checking', nickname: '360 Checking' }]);
    }
    if (init?.method !== 'POST') return Response.json([]);
    return Response.json({ code: 201 }, { status: 201 });
  });
  await expect(createNessieAccounts('customer-id', ['Checking'], runtime, transport)).resolves.toEqual({});
  expect(transport.mock.calls.filter(([url, init]) => init?.method === 'POST' && new URL(String(url)).pathname.startsWith('/accounts/new-checking/') && /\/(?:deposits|withdrawals)$/.test(new URL(String(url)).pathname))).toHaveLength(100);
});
