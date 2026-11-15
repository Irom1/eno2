import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { openAccountsSchema } from '$lib/accountOpening';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';
import { resolveEnv } from '$lib/server/env';
import { AccountOpeningError, openExistingAccounts, readAccountOpeningState } from '$lib/server/nessie/openAccounts';

export const prerender = false;
function failure(error: unknown) {
  return json({ error: error instanceof AccountOpeningError ? error.message : 'I couldn’t check your accounts right now. Please try again shortly.' }, { status: error instanceof AccountOpeningError ? error.status : 502 });
}

export async function GET({ cookies, url, platform }: RequestEvent) {
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'Choose your profile through Sign in first.' }, { status: 401 });
  if (session.customer.id === 'guest') return json({ error: 'Choose a customer profile to open accounts.' }, { status: 403 });
  if (url.searchParams.get('customer') && url.searchParams.get('customer') !== session.customer.id) return json({ error: 'Your active profile changed. Reopen this page from your dashboard.' }, { status: 409 });
  try {
    const state = await readAccountOpeningState(session.customer.id, resolveEnv(platform));
    return json({ customer: state.customer, available: state.available }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST({ request, cookies, url, platform }: RequestEvent) {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Please open accounts from your dashboard.' }, { status: 403 });
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'Choose your profile through Sign in first.' }, { status: 401 });
  if (session.customer.id === 'guest') return json({ error: 'Choose a customer profile to open accounts.' }, { status: 403 });
  const key = request.headers.get('idempotency-key') ?? '';
  if (!/^[a-z0-9-]{20,80}$/i.test(key)) return json({ error: 'Please refresh this page before continuing.' }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Please choose your accounts again.' }, { status: 400 }); }
  const parsed = openAccountsSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, { status: 400 });
  if (parsed.data.customerId !== session.customer.id) return json({ error: 'Your active profile changed. Reopen this page from your dashboard.' }, { status: 409 });
  try {
    const result = await openExistingAccounts(session.customer.id, parsed.data.products, key, resolveEnv(platform));
    if (result.accounts) session.accounts = result.accounts;
    return json(result, { status: result.accountError ? 202 : 201 });
  } catch (error) { return failure(error); }
}
