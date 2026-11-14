import { redirect } from '@sveltejs/kit';
import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies, url }) => {
	if (url.searchParams.get('customer')) return;
	const customerId = getSession(cookies.get(SESSION_COOKIE))?.customer.id;
	if (!customerId || customerId === GUEST_CUSTOMER_ID) return;

	const next = new URL(url);
	next.searchParams.set('customer', customerId);
	redirect(307, next.pathname + next.search);
};
