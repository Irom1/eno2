import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
  mergeTransactions,
  normalizeAccount,
  normalizeBill,
  normalizeCustomer,
  normalizeLoan,
  recentActivity
} from '$lib/server/accounts';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp, type ToolCallResult } from '$lib/server/mcp';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

export const prerender = false;

type AnyRecord = Record<string, unknown>;

const rec = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};

/** MCP tools report data errors as an unsuccessful result, not a throw. */
function requireOk(result: ToolCallResult): unknown {
  if (!result.ok) throw new Error('Nessie read failed');
  return result.data;
}

function itemsOf(data: unknown): unknown[] {
  const payload = rec(data);
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function GET({ cookies, platform }: RequestEvent): Promise<Response> {
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'No active session' }, { status: 401 });

  const runtime = resolveEnv(platform);
  try {
    return await withMcp(runtime, async (mcp) => {
      const [customerResult, accountsResult, billsResult] = await Promise.all([
        callTool(mcp, 'nessie_get_customer', { customerId: session.customer.id }),
        callTool(mcp, 'nessie_list_customer_accounts', { customerId: session.customer.id }),
        callTool(mcp, 'nessie_list_customer_bills', { customerId: session.customer.id })
      ]);

      const customer = normalizeCustomer(requireOk(customerResult));
      const accounts = itemsOf(requireOk(accountsResult)).map(normalizeAccount);
      const bills = itemsOf(requireOk(billsResult)).map(normalizeBill);

      const [loans, recent] = await Promise.all([
        Promise.all(
          accounts.map(async (account) => {
            const result = await callTool(mcp, 'nessie_list_account_loans', {
              accountId: account.id
            });
            return itemsOf(requireOk(result)).map((item) => normalizeLoan(item, account.id));
          })
        ),
        (async () => {
          const focus = accounts.find((account) => account.type.toLowerCase() === 'checking') ?? accounts[0];
          if (!focus) return [];
          const [depositsResult, withdrawalsResult] = await Promise.all([
            callTool(mcp, 'nessie_list_account_deposits', { accountId: focus.id }),
            callTool(mcp, 'nessie_list_account_withdrawals', { accountId: focus.id })
          ]);
          const deposits = itemsOf(requireOk(depositsResult));
          const withdrawals = itemsOf(requireOk(withdrawalsResult));
          return recentActivity(mergeTransactions(deposits, withdrawals, focus.balance, focus.type.toLowerCase().includes('credit')), 5);
        })()
      ]);

      return json({
        customer,
        accounts,
        bills,
        loans: loans.flat(),
        recentActivity: recent
      });
    });
  } catch {
    return json({ error: 'Failed to load accounts' }, { status: 502 });
  }
}
