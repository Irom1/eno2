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

export async function GET({ platform, url }: RequestEvent): Promise<Response> {
  const runtime = resolveEnv(platform);
  try {
    return await withMcp(runtime, async (mcp) => {
      const customerId = url.searchParams.get('customer');
      const result = customerId
        ? await callTool(mcp, 'nessie_get_customer', { customerId })
        : await callTool(mcp, 'nessie_list_customers', {});
      if (!result.ok) return json({ customers: [] }, { status: 502 });
      const payload = result.data as { items?: RawCustomer[] } | null;
      const items: RawCustomer[] = customerId
        ? [result.data as RawCustomer].filter((customer) => customer?._id === customerId)
        : Array.isArray(payload?.items) ? payload.items : [];
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
