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

for (const status of ['correction', 'not_found', 'unavailable'] as const) {
  it(`keeps signup on details when address validation returns ${status}, even if the model advanced`, async () => {
    vi.mocked(verifyAddress).mockResolvedValue({ status, message: 'Please finish your mailing address first.' });
    vi.mocked(runOnboarding).mockResolvedValue({ message: 'Pick your spending categories and accounts.', answers, accountChoice: 'both', spending, includeCreditCard: true, recommendedCard: null, card: null, stage: 'review', ready: true, confirmed: true });
    const response = await POST(event({ message: 'Here is my address', answers, accountChoice: 'undecided', spending, history: [] }));
    const result = await response.json();
    expect(result).toMatchObject({ stage: 'details', ready: false, confirmed: false });
    expect(result.message).toBe('Please finish your mailing address first.');
    expect(result.message).not.toMatch(/categor|checking|savings/);
  });
}

it('waits for the answer when Eno explicitly asks to confirm a matched address', async () => {
  vi.mocked(runOnboarding).mockResolvedValue({ message: 'Is this the right mailing address?', answers, accountChoice: 'undecided', spending, includeCreditCard: null, recommendedCard: null, card: null, stage: 'accounts', ready: false, confirmed: false });
  const response = await POST(event({ message: '4600 Silver Hill Rd', answers, accountChoice: 'undecided', spending, history: [] }));
  expect(await response.json()).toMatchObject({ stage: 'details', ready: false, message: 'Is this the right mailing address?' });
});

it('does not accept an old account checklist before spending priorities are answered', async () => {
  const response = await POST(event({ message: 'yes', answers, accountChoice: 'undecided', spending: { status: 'undecided', categories: [] }, selectedAccounts: { checking: true, savings: true, creditCard: true }, history: [] }));
  expect(await response.json()).toMatchObject({ stage: 'spending', ready: false, accountChoice: 'undecided', includeCreditCard: null });
});

it('ignores stale spending checkboxes while a required address field is missing', async () => {
  const response = await POST(event({ message: 'Dining', answers: { ...answers, zip: '' }, accountChoice: 'undecided', spending: { status: 'undecided', categories: [] }, selectedSpending: ['dining'], history: [] }));
  expect(await response.json()).toMatchObject({ stage: 'details', ready: false, spending: { status: 'undecided', categories: [] } });
  expect(verifyAddress).not.toHaveBeenCalled();
});
