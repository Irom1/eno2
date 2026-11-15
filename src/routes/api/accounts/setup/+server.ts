import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { AccountSetupError, continueAccountSetup } from '$lib/server/nessie/accountSetup';

export const prerender = false;
export async function POST({ request, url, platform }: RequestEvent) {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Please finish account setup from Eno.' }, { status: 403 });
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'Invalid setup request.' }, { status: 400 }); }
  if (!body || typeof body.token !== 'string') return json({ error: 'A setup token is required.' }, { status: 400 });
  try {
    const result = await continueAccountSetup(body.token, resolveEnv(platform));
    return json(result, { status: result.setupToken || result.accountError ? 202 : 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return json({ error: error instanceof AccountSetupError ? error.message : 'Account setup could not be confirmed. Please check your dashboard.' }, { status: error instanceof AccountSetupError ? 409 : 502 });
  }
}
