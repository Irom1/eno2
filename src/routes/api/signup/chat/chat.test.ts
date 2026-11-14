import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './+server';
import { verifyAddress } from '$lib/server/address';
import { runOnboarding } from '$lib/server/onboarding';
import { reviewFingerprint } from '$lib/signupConfirmation';

vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/address', () => ({ verifyAddress: vi.fn() }));
vi.mock('$lib/server/onboarding', async (original) => ({ ...await original<typeof import('$lib/server/onboarding')>(), runOnboarding: vi.fn() }));

const address = { street_number: '4600', street_name: 'SILVER HILL RD', city: 'WASHINGTON', state: 'DC', zip: '20233' };
const answers = { first_name: 'Demo', last_name: 'Tester', ...address };
const spending = { status: 'skip' as const, categories: [] };
const event = (body: unknown) => ({ request: new Request('http://localhost/api/signup/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), platform: undefined }) as Parameters<typeof POST>[0];
beforeEach(() => { vi.resetAllMocks(); vi.mocked(verifyAddress).mockResolvedValue({ status: 'matched', message: 'Street address matched.', address }); });

it('uses a single displayed correction when the user says yes, without asking the model again', async () => {
  const response = await POST(event({ message: 'yes', answers: { ...answers, city: 'Suitland' }, accountChoice: 'undecided', spending: { status: 'undecided', categories: [] }, includeCreditCard: null, pendingAddress: address, history: [] }));
  const result = await response.json();
  expect(result.answers).toEqual(answers); expect(result.stage).toBe('spending'); expect(result.confirmed).toBe(false);
  expect(verifyAddress).toHaveBeenCalledWith(address); expect(runOnboarding).not.toHaveBeenCalled();
});
it('accepts a reviewed profile’s natural affirmative independently of model wording', async () => {
  const response = await POST(event({ message: 'sure!', answers, accountChoice: 'none', spending, includeCreditCard: false, reviewedFingerprint: reviewFingerprint(answers, 'none', spending, false), history: [] }));
  expect((await response.json()).confirmed).toBe(true); expect(runOnboarding).not.toHaveBeenCalled();
});
it('does not approve a stale profile review or a negated confirmation', async () => {
  vi.mocked(runOnboarding).mockResolvedValue({ message: 'What would you like to change?', answers, accountChoice: 'none', spending, includeCreditCard: false, recommendedCard: null, card: null, stage: 'review', ready: true, confirmed: false });
  const response = await POST(event({ message: 'yes, but change my address', answers, accountChoice: 'none', spending, includeCreditCard: false, reviewedFingerprint: 'stale', history: [] }));
  expect((await response.json()).confirmed).toBe(false); expect(runOnboarding).toHaveBeenCalledOnce();
});
