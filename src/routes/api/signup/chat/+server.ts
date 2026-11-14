import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { resolveEnv } from '$lib/server/env';
import { onboardingRequestSchema, reconcileOnboarding, runOnboarding } from '$lib/server/onboarding';
import { customerCreateSchema, customerFromAnswers } from '$lib/signup';
import { answersWithAddress, type AddressCheck } from '$lib/address';
import { verifyAddress } from '$lib/server/address';
import { isAddressAffirmative, isAffirmative, reviewFingerprint } from '$lib/signupConfirmation';
import { SIGNUP_FIELDS } from '$lib/signup';

export const prerender = false;
export async function POST({ request, platform }: RequestEvent): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'That message didn’t come through. Please try again.' }, { status: 400 }); }
  const parsed = onboardingRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'That message was a little too long. Could you try a shorter one?' }, { status: 400 });
  try {
    const addressAccepted = isAddressAffirmative(parsed.data.message) && !!parsed.data.pendingAddress;
    const selectedAddress = parsed.data.selectedAddress ?? (addressAccepted ? parsed.data.pendingAddress : undefined);
    const input = selectedAddress
      ? { ...parsed.data, answers: answersWithAddress(parsed.data.answers, selectedAddress) }
      : parsed.data;
    const profileAccepted = isAffirmative(input.message) && input.reviewedFingerprint === reviewFingerprint(input.answers, input.accountChoice, input.spending, input.includeCreditCard);
    const reply = input.selectedSpending ? 'Good picks. I’ve matched a Capital One card to your top category and checked all three account options below. Keep the ones you want.' : input.selectedAccounts ? 'Got your choices. Take a glance at your profile, then just tell me if it looks right.' : profileAccepted ? 'You got it — let’s get your dashboard ready.' : `Got it — I’ll use that mailing address.${!input.answers.first_name ? ' What should I call you?' : !input.answers.last_name ? ' And your last name?' : ''}`;
    const result = addressAccepted || profileAccepted || input.selectedSpending || input.selectedAccounts
      ? reconcileOnboarding(input, { reply, updates: Object.fromEntries(SIGNUP_FIELDS.map((key) => [key, null])), accountChoice: input.accountChoice, spending: null, confirmed: profileAccepted })
      : await runOnboarding(resolveEnv(platform), input);
    const address = customerCreateSchema.shape.address.safeParse(customerFromAnswers(result.answers).address);
    if (!address.success) return json(result);
    let addressCheck: AddressCheck;
    try { addressCheck = await verifyAddress(address.data); }
    catch { addressCheck = { status: 'unavailable', message: 'The address check is taking a break. Your details are still here; we’ll need to check the address before creating your profile.' }; }
    if (addressCheck.status === 'matched' && addressCheck.address) result.answers = answersWithAddress(result.answers, addressCheck.address);
    else { result.ready = false; result.confirmed = false; result.message += '\n\n' + addressCheck.message; }
    return json({ ...result, addressCheck });
  }
  catch { return json({ error: 'I lost my train of thought for a moment. Your details are still here — can we try that message again?' }, { status: 502 }); }
}
