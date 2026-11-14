import { reviewFingerprint } from '../signupConfirmation';
import { describe, expect, it } from 'vitest';
import { emptyAnswers, normalizeState, SIGNUP_FIELDS } from '../signup';
import { reconcileOnboarding, type OnboardingRequest } from './onboarding';

const full = { first_name: 'Ada', last_name: 'Lovelace', street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' };
const emptyUpdates = Object.fromEntries(SIGNUP_FIELDS.map((key) => [key, null]));
const request = (overrides: Partial<OnboardingRequest> = {}): OnboardingRequest => ({ message: 'Hello', answers: emptyAnswers(), accountChoice: 'undecided', spending: { status: 'skip', categories: [] }, includeCreditCard: false, history: [], ...overrides });

describe('conversational onboarding', () => {
  it('requires spending choices before showing the prechecked account checklist, then reviews the user’s exact selection', () => {
    const base = request({ answers: full, spending: { status: 'undecided', categories: [] }, includeCreditCard: null });
    const first = reconcileOnboarding(base, { reply: 'What matters most?', updates: emptyUpdates, accountChoice: 'undecided', confirmed: false });
    expect(first.stage).toBe('spending');
    const categories = reconcileOnboarding({ ...base, selectedSpending: ['dining', 'travel'] }, { reply: 'Your account options.', updates: emptyUpdates, accountChoice: 'undecided', confirmed: false });
    expect(categories.stage).toBe('accounts'); expect(categories.ready).toBe(false); expect(categories.recommendedCard?.name).toBe('Savor');
    const accounts = reconcileOnboarding({ ...base, spending: categories.spending, selectedAccounts: { checking: true, savings: false, creditCard: false } }, { reply: 'Review your profile.', updates: emptyUpdates, accountChoice: 'undecided', confirmed: false });
    expect(accounts.stage).toBe('review'); expect(accounts.accountChoice).toBe('checking'); expect(accounts.includeCreditCard).toBe(false); expect(accounts.card).toBeNull();
    const empty = reconcileOnboarding({ ...base, spending: categories.spending, selectedAccounts: { checking: false, savings: false, creditCard: false } }, { reply: 'Fresh start.', updates: emptyUpdates, accountChoice: 'undecided', confirmed: false });
    expect(empty.ready).toBe(true); expect(empty.accountChoice).toBe('none'); expect(empty.card).toBeNull();
  });
  it('accepts ordinary affirmatives for an unchanged reviewed profile even if the model asks again', () => {
    const spending = { status: 'skip' as const, categories: [] };
    for (const message of ['yes', 'yep', 'sure', 'correct', 'okay']) {
      const result = reconcileOnboarding(request({ answers: full, accountChoice: 'both', spending, message, reviewedFingerprint: reviewFingerprint(full, 'both', spending) }), { reply: 'Please confirm again.', updates: emptyUpdates, accountChoice: 'both', spending: null, confirmed: false });
      expect(result.confirmed, message).toBe(true);
    }
    const result = reconcileOnboarding(request({ answers: full, accountChoice: 'both', message: 'yes' }), { reply: 'Okay.', updates: emptyUpdates, accountChoice: 'both', confirmed: true });
    expect(result.confirmed).toBe(false);
  });
  it('uses the model’s intent for other positive wording while still blocking edits or conditions', () => {
    const spending = { status: 'skip' as const, categories: [] };
    const reviewed = request({ answers: full, accountChoice: 'both', spending, includeCreditCard: false, reviewedFingerprint: reviewFingerprint(full, 'both', spending, false) });
    for (const message of ['That all sounds lovely to me', 'I agree, everything is fine']) {
      expect(reconcileOnboarding({ ...reviewed, message }, { reply: 'I’ll open your dashboard.', updates: emptyUpdates, accountChoice: 'both', confirmed: true }).confirmed).toBe(true);
    }
    for (const message of ['Looks good but swap the card', 'Sounds great if there are no fees', 'Yes my city is Cambridge']) {
      expect(reconcileOnboarding({ ...reviewed, message }, { reply: 'Okay.', updates: emptyUpdates, accountChoice: 'both', confirmed: true }).confirmed).toBe(false);
    }
  });
  it('asks spending priorities before account selection and waits for the answer before review', () => {
    const result = reconcileOnboarding(request({ answers: full, accountChoice: 'undecided', spending: { status: 'undecided', categories: [] }, includeCreditCard: null }), { reply: 'Both it is.', updates: emptyUpdates, accountChoice: 'both', confirmed: true });
    expect(result.ready).toBe(false); expect(result.confirmed).toBe(false);
    expect(result.message).toMatch(/spending matters most/);
    expect(result.card).toBeNull();
  });
  it('matches the stated top priority, preserves it through tangents, and reviews changes before creating', () => {
    const spending = { status: 'personalize' as const, categories: ['travel' as const, 'dining' as const] };
    const result = reconcileOnboarding(request({ answers: full, accountChoice: 'checking', message: 'Travel first, then dining', spending: { status: 'undecided', categories: [] } }), { reply: 'Venture is your demo match.', updates: emptyUpdates, accountChoice: 'checking', spending, confirmed: true });
    expect(result.ready).toBe(true); expect(result.confirmed).toBe(false); expect(result.recommendedCard?.id).toBe('venture');
    const tangent = reconcileOnboarding(request({ answers: full, accountChoice: 'checking', spending, message: 'What are these points?' }), { reply: 'They’re demo points.', updates: emptyUpdates, accountChoice: 'checking', spending: null, confirmed: false });
    expect(tangent.spending).toEqual(spending); expect(tangent.recommendedCard?.id).toBe('venture');
    const edited = reconcileOnboarding(request({ answers: full, accountChoice: 'checking', spending, message: 'Actually, dining is most important. Go ahead.' }), { reply: 'Savor is your updated match.', updates: emptyUpdates, accountChoice: 'checking', spending: { status: 'personalize', categories: ['dining', 'travel'] }, confirmed: true });
    expect(edited.recommendedCard?.id).toBe('savor'); expect(edited.confirmed).toBe(false);
  });
  it('accepts multiple details together and normalizes recognizable state misspellings', () => {
    const result = reconcileOnboarding(request(), { reply: 'Nice to meet you, Ada.', updates: { ...full, state: 'masachusets' }, accountChoice: 'undecided', confirmed: false });
    expect(result.answers).toEqual(full);
    expect(result.ready).toBe(false);
    expect(result.message).toMatch(/preselected 360 Checking, 360 Performance Savings/);
    expect(normalizeState('massachussetts')).toBe('MA');
    expect(normalizeState('New Yrok')).toBe('NY');
    expect(normalizeState('QQ')).toBe('QQ');
  });
  it('keeps gathered details while answering unrelated questions', () => {
    const result = reconcileOnboarding(request({ answers: full, message: 'How does savings work?' }), { reply: 'Savings is for setting money aside.', updates: emptyUpdates, accountChoice: 'undecided', confirmed: false });
    expect(result.answers).toEqual(full);
    expect(result.confirmed).toBe(false);
  });
  it('rejects invalid extracted values and requires a deliberate final review approval', () => {
    const invalid = reconcileOnboarding(request(), { reply: 'Hi.', updates: { ...emptyUpdates, state: 'ZZ', zip: '123' }, accountChoice: 'none', confirmed: true });
    expect(invalid.answers.state).toBe(''); expect(invalid.answers.zip).toBe(''); expect(invalid.confirmed).toBe(false);
    for (const message of ['Should I open it?', 'Do not create it', 'Wait, change my city']) {
      expect(reconcileOnboarding(request({ answers: full, accountChoice: 'both', message }), { reply: 'Okay.', updates: emptyUpdates, accountChoice: 'both', confirmed: true }).confirmed).toBe(false);
    }
    expect(reconcileOnboarding(request({ answers: full, accountChoice: 'both', message: 'Yes, looks good. Go ahead.', reviewedFingerprint: reviewFingerprint(full, 'both', { status: 'skip', categories: [] }) }), { reply: 'Let’s go.', updates: emptyUpdates, accountChoice: 'both', confirmed: true }).confirmed).toBe(true);
    expect(reconcileOnboarding(request({ answers: full, accountChoice: 'both', message: 'Yes, but my ZIP is 02138' }), { reply: 'Updated.', updates: { ...emptyUpdates, zip: '02138' }, accountChoice: 'both', confirmed: true }).confirmed).toBe(false);
  });
});
