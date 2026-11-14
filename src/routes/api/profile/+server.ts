import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
import { resolveEnv } from '$lib/server/env';
import { closeNessieProfile } from '$lib/server/nessie/closeProfile';
import { destroyCustomerSessions, getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

export const prerender = false;

export const DELETE: RequestHandler = async ({ request, url, cookies, platform }) => {
  if (request.headers.get('origin') !== url.origin) {
    return json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session || session.customer.id === GUEST_CUSTOMER_ID) {
    return json({ error: 'Open your profile before closing it.' }, { status: 401 });
  }

  const customerId = session.customer.id;
  const body = await request.json().catch(() => null);
  if (body?.customerId !== customerId) {
    return json({ error: 'The active profile changed. Refresh and try again.' }, { status: 409 });
  }

  try {
    await closeNessieProfile(customerId, resolveEnv(platform));
    destroyCustomerSessions(customerId);
    if (cookies.get(SESSION_COOKIE) === session.id) cookies.delete(SESSION_COOKIE, { path: '/' });
    return new Response(null, { status: 204 });
  } catch {
    return json({ error: "We couldn't confirm closure. Some accounts may already be deleted. You can retry to finish closing this profile." }, { status: 502 });
  }
};
