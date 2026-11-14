import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { onboardingRequestSchema, runOnboarding } from '$lib/server/onboarding';

export const prerender = false;
export async function POST({ request, platform }: RequestEvent): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'That message didn’t come through. Please try again.' }, { status: 400 }); }
  const parsed = onboardingRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'That message was a little too long. Could you try a shorter one?' }, { status: 400 });
  try { return json(await runOnboarding(resolveEnv(platform), parsed.data)); }
  catch { return json({ error: 'I lost my train of thought for a moment. Your details are still here — can we try that message again?' }, { status: 502 }); }
}
