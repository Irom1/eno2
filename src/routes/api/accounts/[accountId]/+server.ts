import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
  mergeTransactions,
  normalizeAccount,
  normalizeBill,
  normalizeCustomer,
  normalizeLoan
} from '$lib/server/accounts';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp, type ToolCallResult } from '$lib/server/mcp';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

export const prerender = false;

type AnyRecord = Record<string, unknown>;

const rec = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};

function requireOk(result: ToolCallResult): unknown {
  if (!result.ok) throw new Error('Nessie read failed');
  return result.data;
}

function itemsOf(data: unknown): unknown[] {
  const payload = rec(data);
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function GET({ cookies, params, platform }: RequestEvent): Promise<Response> {
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'No active session' }, { status: 401 });

  const accountId = params.accountId ?? '';
  const owned = session.accounts.some((account) => account.id === accountId);
  if (!accountId || !owned) return json({ error: 'Account not found' }, { status: 404 });

  const runtime = resolveEnv(platform);
  try {
    return await withMcp(runtime, async (mcp) => {
      const [accountResult, customerResult, depositsResult, withdrawalsResult, billsResult, loansResult] =
        await Promise.all([
          callTool(mcp, 'nessie_get_account', { accountId }),
          callTool(mcp, 'nessie_get_account_customer', { accountId }),
          callTool(mcp, 'nessie_list_account_deposits', { accountId }),
          callTool(mcp, 'nessie_list_account_withdrawals', { accountId }),
          callTool(mcp, 'nessie_list_account_bills', { accountId }),
          callTool(mcp, 'nessie_list_account_loans', { accountId })
        ]);

      const account = normalizeAccount(requireOk(accountResult));
      const customer = normalizeCustomer(requireOk(customerResult));
      const deposits = itemsOf(requireOk(depositsResult));
      const withdrawals = itemsOf(requireOk(withdrawalsResult));

      return json({
        account,
        customer,
        transactions: mergeTransactions(deposits, withdrawals, account.balance, account.type.toLowerCase().includes('credit')),
        bills: itemsOf(requireOk(billsResult)).map(normalizeBill),
        loans: itemsOf(requireOk(loansResult)).map((item) => normalizeLoan(item, accountId))
      });
    });
  } catch {
    return json({ error: 'Failed to load account' }, { status: 502 });
  }
}
