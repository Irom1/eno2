import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp } from '$lib/server/mcp';
import {
  createSession,
  destroySession,
  getSession,
  type AccountSummary,
  type CustomerIdentity
} from '$lib/server/session';
import { SESSION_COOKIE, publicSession } from '$lib/server/sessionCookie';

export const prerender = false;

interface RawCustomer {
  _id?: string;
  firstName?: string;
  lastName?: string;
}

interface RawAccount {
  _id?: string;
  type?: string;
  nickname?: string;
  balance?: number | string;
  rewards?: number | string;
  accountNumber?: string;
}

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function POST({ request, cookies, platform }: RequestEvent): Promise<Response> {
  let body: { customerId?: unknown };
  try {
    body = (await request.json()) as { customerId?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
  if (!customerId) return json({ error: 'customerId is required' }, { status: 400 });

  const runtime = resolveEnv(platform);
  try {
    return await withMcp(runtime, async (mcp) => {
      const customerResult = await callTool(mcp, 'nessie_get_customer', { customerId });
      const match = customerResult.data as RawCustomer | null;
      if (!customerResult.ok || !match || String(match._id ?? '') !== customerId) {
        return json({ error: 'Unknown customerId' }, { status: 404 });
      }

      const accountsResult = await callTool(mcp, 'nessie_list_customer_accounts', { customerId });
      if (!accountsResult.ok) return json({ error: 'Could not load customer accounts' }, { status: 502 });
      const accountsPayload = accountsResult.data as { items?: RawAccount[] } | null;
      const rawAccounts = Array.isArray(accountsPayload?.items) ? accountsPayload.items : [];

      const customer: CustomerIdentity = {
        id: customerId,
        firstName: match.firstName ?? '',
        lastName: match.lastName ?? ''
      };
      const accounts: AccountSummary[] = rawAccounts.map((account) => ({
        id: String(account._id ?? ''),
        type: account.type ?? 'unknown',
        nickname: account.nickname ?? '',
        balance: num(account.balance),
        rewards: num(account.rewards),
        accountNumber: account.accountNumber ?? ''
      }));

      const session = createSession(customer, accounts);
      cookies.set(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 1800,
        secure: new URL(request.url).protocol === 'https:'
      });

      return json(publicSession(session));
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 502 }
    );
  }
}

export async function GET({ cookies }: RequestEvent): Promise<Response> {
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'No active session' }, { status: 401 });
  return json(publicSession(session));
}

export async function DELETE({ cookies }: RequestEvent): Promise<Response> {
  destroySession(cookies.get(SESSION_COOKIE));
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return new Response(null, { status: 204 });
}
