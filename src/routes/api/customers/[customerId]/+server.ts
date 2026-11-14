import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { CustomerRemovalError, setCustomerRemoved } from '$lib/server/nessie/removeCustomer';
import { markDemoCustomerDeleted, restoreDemoCustomer } from '$lib/server/deletedDemoCustomers';
import { destroyCustomerSessions, getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

async function update(event: RequestEvent, removed: boolean) {
  const { request, params, platform, cookies } = event;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, { status: 403 });
  const id = params.customerId?.trim();
  if (!id || id.length > 200) return json({ error: 'Account not found.' }, { status: 404 });
  try {
    await setCustomerRemoved(id, removed, resolveEnv(platform));
    if (removed) {
      const current = getSession(cookies.get(SESSION_COOKIE));
      markDemoCustomerDeleted(id);
      destroyCustomerSessions(id);
      if (current?.customer.id === id) cookies.delete(SESSION_COOKIE, { path: '/' });
    } else restoreDemoCustomer(id);
    return json({ customerId: id, removed });
  } catch (error) {
    return json({ error: error instanceof CustomerRemovalError ? error.message : 'Couldn’t change this account. Please try again.' }, { status: error instanceof CustomerRemovalError ? error.status : 502 });
  }
}
export const DELETE = (event: RequestEvent) => update(event, true);
export const POST = (event: RequestEvent) => update(event, false);
