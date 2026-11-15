// Runs real server operations in workerd against an entirely local fake Nessie.
// Catches runtime differences (such as unsupported redirect modes) that Node mocks miss.
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import assert from 'node:assert/strict';

const bundled = await build({
  stdin: { contents: `
    import { createNessieCustomer } from './src/lib/server/nessie/createCustomer';
    import { openExistingAccounts } from './src/lib/server/nessie/openAccounts';
    import { continueAccountSetup } from './src/lib/server/nessie/accountSetup';
    import { setCustomerRemoved } from './src/lib/server/nessie/removeCustomer';
    import { closeNessieProfile } from './src/lib/server/nessie/closeProfile';
    import { withMcp, callTool } from './src/lib/server/mcp';
    const runtime = { NESSIE_API_KEY: 'fake-key', NESSIE_BASE_URL: 'https://nessie.test', LLM: 'mock', GEMINI_API_KEY: '', GEMINI_MODEL: '' };
    export default { async fetch(request) {
      try {
        const body = await request.json();
        let result;
        switch (body.action) {
          case 'customer': result = await createNessieCustomer(body.input, runtime); break;
          case 'open': result = await openExistingAccounts('fake-customer', ['checking', 'savings', 'venture', 'savor', 'quicksilver', 'discover'], crypto.randomUUID(), runtime); break;
          case 'setup': result = await continueAccountSetup(body.token, runtime); break;
          case 'read': result = await withMcp(runtime, async mcp => Promise.all([
            callTool(mcp, 'nessie_list_customer_accounts', {customerId:'fake-customer'}),
            callTool(mcp, 'insight_climatewise', {customerId:'fake-customer',days:90}),
            callTool(mcp, 'insight_financial_overview', {customerId:'fake-customer'}),
            callTool(mcp, 'insight_upcoming_bills', {customerId:'fake-customer',days:30})
          ])); break;
          case 'remove': await setCustomerRemoved('fake-customer', body.removed, runtime); result = {}; break;
          case 'close': await closeNessieProfile('fake-customer', runtime); result = {}; break;
        }
        return Response.json(result);
      } catch (error) { return Response.json({error:String(error)}, {status:500}); }
    } };`, resolveDir: process.cwd(), sourcefile: 'worker-smoke.ts', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'browser', external: ['node:*'], write: false
});

let customer, requests = 0, maxRequests = 0, id = 0;
const accounts = new Map(), saved = new Map();
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: 'eno-runtime-regression', modules: true, script: bundled.outputFiles[0].text,
  compatibilityDate: '2025-09-01', compatibilityFlags: ['nodejs_compat'],
  outboundService: async request => {
    assert.equal(new URL(request.url).hostname, 'nessie.test');
    maxRequests = Math.max(maxRequests, ++requests);
    assert.ok(requests <= 50, 'Exceeded Workers Free subrequest budget');
    const path = new URL(request.url).pathname;
    if (request.method === 'POST') {
      const body = await request.json();
      if (path === '/customers') {
        customer = { _id: 'fake-customer', ...body };
        return Response.json({ objectCreated: customer }, { status: 201 });
      }
      if (path === '/customers/fake-customer/accounts') {
        const account = { _id: `fake-account-${++id}`, customer_id: customer._id, ...body };
        accounts.set(account._id, account);
        return Response.json({ objectCreated: account }, { status: 201 });
      }
      saved.set(path, [...saved.get(path) ?? [], { _id: `fake-record-${++id}`, ...body }]);
      return Response.json({ code: 201 }, { status: 201 });
    }
    if (request.method === 'PUT') {
      customer = { ...customer, ...await request.json() };
      return new Response(null, { status: 202 });
    }
    if (request.method === 'DELETE') {
      accounts.delete(path.split('/').at(-1));
      return new Response(null, { status: 204 });
    }
    if (path === '/customers') return Response.json(customer ? [customer] : []);
    if (path === '/customers/fake-customer') return Response.json(customer);
    if (path === '/customers/fake-customer/accounts') return Response.json([...accounts.values()]);
    if (path === '/customers/fake-customer/bills') return Response.json([...saved.entries()].filter(([path]) => path.endsWith('/bills')).flatMap(([, rows]) => rows));
    if (/^\/accounts\/[^/]+$/.test(path)) return Response.json(accounts.get(path.split('/').at(-1)));
    return Response.json(saved.get(path) ?? []);
  }
}] }));

async function run(body) {
  requests = 0;
  const response = await mf.dispatchFetch('https://eno.test', { method: 'POST', body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.accountError, undefined, JSON.stringify(result));
  return result;
}
try {
  const created = await run({ action: 'customer', input: { first_name: 'Worker', last_name: 'Regression', address: {street_number:'1',street_name:'Test St',city:'Boston',state:'MA',zip:'02139'} } });
  assert.equal(created.customerId, 'fake-customer');
  let result = await run({ action: 'open' }), steps = 0;
  assert.ok(result.setupToken);
  while (result.setupToken && steps++ < 60) result = await run({ action: 'setup', token: result.setupToken });
  assert.equal(result.setupToken, undefined);
  assert.equal(accounts.size, 6);
  const transactions = [...saved.entries()].filter(([path]) => /\/(deposits|withdrawals)$/.test(path)).reduce((sum, [, rows]) => sum + rows.length, 0);
  assert.equal(transactions, 600);
  const reads = await run({ action: 'read' });
  assert.ok(reads.every(result => result.ok), JSON.stringify(reads));
  assert.ok(reads[1].data.purchaseCount > 0, 'ClimateWise must include saved purchases');
  await run({ action: 'remove', removed: true });
  await run({ action: 'remove', removed: false });
  assert.equal(customer.first_name, 'Worker');
  await run({ action: 'close' });
  assert.equal(accounts.size, 0);
  assert.equal(customer.first_name, 'Closed');
  console.log(JSON.stringify({ runtime: 'workerd', accounts: 6, transactions, continuations: steps, maxSubrequests: maxRequests, verified: ['signup', 'add accounts and card', 'ClimateWise', 'overview', 'bills', 'remove and restore profile', 'close profile'] }));
} finally { await mf.dispose(); }
