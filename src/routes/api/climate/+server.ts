import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildReport, type AppTransaction } from '$lib/climate/emissions';

/**
 * GET /api/climate?days=90
 * Pulls every account's Nessie-backed transactions through the app's existing
 * /api/accounts endpoints (same session cookie via event.fetch) and returns a ClimateReport.
 */
export const GET: RequestHandler = async ({ fetch, url }) => {
	const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 90));

	const accRes = await fetch('/api/accounts');
	if (!accRes.ok) return json({ error: 'Could not load accounts' }, { status: 502 });
	const { customer, accounts = [] } = await accRes.json();
	if (url.searchParams.has('customer') && url.searchParams.get('customer') !== customer?.id) {
		return json({ error: 'Your active profile changed. Please reopen the report from your dashboard.' }, { status: 409 });
	}

	const details = await Promise.all(
		accounts.map((a: { id: string }) =>
			fetch(`/api/accounts/${encodeURIComponent(a.id)}`).then((r) => (r.ok ? r.json() : null))
		)
	);
	// Do not retain an incomplete score for the browser session when an account failed to load.
	if (details.some((detail) => !detail || !Array.isArray(detail.transactions))) {
		return json({ error: 'Could not load all account activity' }, { status: 502 });
	}

	const transactions: AppTransaction[] = details.flatMap((d) => d?.transactions ?? []);
	const report = buildReport(transactions, { days });

	return json({ customer: customer ? { id: customer.id, firstName: customer.firstName, lastName: customer.lastName } : null, report }, { headers: { 'cache-control': 'no-store' } });
};
