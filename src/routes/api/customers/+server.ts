import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { callTool, withMcp } from '$lib/server/mcp';

export const prerender = false;

interface RawCustomer {
  _id?: string;
  firstName?: string;
  lastName?: string;
  address?: { city?: string; state?: string; zip?: string };
}

export async function GET({ platform }: RequestEvent): Promise<Response> {
  const runtime = resolveEnv(platform);
  try {
    return await withMcp(runtime, async (mcp) => {
      const result = await callTool(mcp, 'nessie_list_customers', {});
      const payload = result.data as { items?: RawCustomer[] } | null;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const customers = items.map((customer) => ({
        id: String(customer._id ?? ''),
        firstName: customer.firstName ?? '',
        lastName: customer.lastName ?? '',
        city: customer.address?.city ?? '',
        state: customer.address?.state ?? '',
        zip: customer.address?.zip ?? ''
      }));
      return json({ customers });
    });
  } catch (error) {
    return json(
      { customers: [], error: error instanceof Error ? error.message : 'Failed to list customers' },
      { status: 502 }
    );
  }
}
