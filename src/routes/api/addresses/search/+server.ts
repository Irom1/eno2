import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestEvent } from './$types';
import { addressSearchText } from '$lib/address';
import { searchAddresses } from '$lib/server/address';

const schema = z.object({ query: z.string().max(200), context: z.object({ city: z.string().max(80).optional(), state: z.string().max(2).optional(), zip: z.string().max(10).optional() }).optional() });
export async function POST({ request }: RequestEvent): Promise<Response> {
  let value: unknown;
  try { value = await request.json(); } catch { return json({ error: 'Invalid address search' }, { status: 400 }); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return json({ error: 'Invalid address search' }, { status: 400 });
  const query = addressSearchText(parsed.data.query);
  if (!query) return json({ suggestions: [] });
  try { return json({ suggestions: await searchAddresses(query, parsed.data.context) }, { headers: { 'cache-control': 'no-store' } }); }
  catch { return json({ error: 'Address suggestions are unavailable right now. You can still type your address.' }, { status: 503 }); }
}
