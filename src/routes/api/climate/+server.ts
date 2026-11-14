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

	const details = await Promise.all(
		accounts.map((a: { id: string }) =>
			fetch(`/api/accounts/${encodeURIComponent(a.id)}`).then((r) => (r.ok ? r.json() : null))
		)
	);

	const transactions: AppTransaction[] = details.flatMap((d) => d?.transactions ?? []);
	const report = buildReport(transactions, { days });

	return json({ customer: customer ? { firstName: customer.firstName, lastName: customer.lastName } : null, report });
};
