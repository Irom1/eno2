import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp } from '$lib/server/mcp';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

export const prerender = false;

/**
 * GET /api/climate?days=90
 * Returns the shared ClimateWise report from the insight_climatewise MCP tool,
 * so the dashboard widget, the /climatewise page, and chat agree on one score.
 *
 * `customer` is the profile the browser cache believes is active; a mismatch
 * means the profile changed under the request, so refuse to answer for it.
 */
export const GET = async ({ cookies, platform, url }: RequestEvent): Promise<Response> => {
	const session = getSession(cookies.get(SESSION_COOKIE));
	if (!session) return json({ error: 'No active session' }, { status: 401 });

	const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 90));

	const requestedCustomer = url.searchParams.get('customer');
	if (requestedCustomer && requestedCustomer !== session.customer.id) {
		return json(
			{ error: 'Your active profile changed. Please reopen the report from your dashboard.' },
			{ status: 409 }
		);
	}

	const runtime = resolveEnv(platform);
	try {
		return await withMcp(runtime, async (mcp) => {
			const result = await callTool(mcp, 'insight_climatewise', {
				customerId: session.customer.id,
				days
			});
			if (!result.ok) {
				return json({ error: 'Could not load the ClimateWise report' }, { status: 502 });
			}
			return json(
				{
					customer: {
						id: session.customer.id,
						firstName: session.customer.firstName,
						lastName: session.customer.lastName
					},
					report: result.data
				},
				{ headers: { 'cache-control': 'no-store' } }
			);
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Could not load the ClimateWise report' },
			{ status: 502 }
		);
	}
};
