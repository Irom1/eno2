import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp } from '$lib/server/mcp';
import { getSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';

export const prerender = false;

export async function GET({ cookies, platform }: RequestEvent): Promise<Response> {
  const session = getSession(cookies.get(SESSION_COOKIE));
  if (!session) return json({ error: 'No active session' }, { status: 401 });

  const runtime = resolveEnv(platform);
  try {
    return await withMcp(runtime, async (mcp) => {
      const checking = session.accounts.find(
        (account) => account.type.toLowerCase() === 'checking'
      );

      const [overview, bills, spending, anomalies] = await Promise.all([
        callTool(mcp, 'insight_financial_overview', { customerId: session.customer.id }),
        callTool(mcp, 'insight_upcoming_bills', { customerId: session.customer.id, days: 30 }),
        checking
          ? callTool(mcp, 'insight_spending_breakdown', {
              accountId: checking.id,
              months: 3
            }).catch(() => null)
          : Promise.resolve(null),
        checking
          ? callTool(mcp, 'insight_anomalies', { accountId: checking.id }).catch(() => null)
          : Promise.resolve(null)
      ]);

      if (!overview.ok) {
        return json({ error: 'Failed to load overview' }, { status: 502 });
      }

      return json({
        customer: session.customer,
        overview: overview.data,
        bills: bills.data,
        spending: spending?.ok ? spending.data : null,
        anomalies: anomalies?.ok ? anomalies.data : null
      });
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to load overview' },
      { status: 502 }
    );
  }
}
