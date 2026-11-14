import { describe, expect, it } from 'vitest';
import { emptyAnswers, normalizeState, SIGNUP_FIELDS } from '../signup';
import { reconcileOnboarding, type OnboardingRequest } from './onboarding';

const full = { first_name: 'Ada', last_name: 'Lovelace', street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' };
const emptyUpdates = Object.fromEntries(SIGNUP_FIELDS.map((key) => [key, null]));
const request = (overrides: Partial<OnboardingRequest> = {}): OnboardingRequest => ({ message: 'Hello', answers: emptyAnswers(), accountChoice: 'undecided', spending: { status: 'skip', categories: [] }, history: [], ...overrides });

describe('conversational onboarding', () => {
  it('asks spending priorities after deposit-account choice and waits for the answer before review', () => {
    const result = reconcileOnboarding(request({ answers: full, accountChoice: 'both', spending: { status: 'undecided', categories: [] } }), { reply: 'Both it is.', updates: emptyUpdates, accountChoice: 'both', confirmed: true });
    expect(result.ready).toBe(false); expect(result.confirmed).toBe(false);
    expect(result.message).toMatch(/spending matters most/);
    expect(result.card).toBeNull();
  });
  it('matches the stated top priority, preserves it through tangents, and reviews changes before creating', () => {
    const spending = { status: 'personalize' as const, categories: ['travel' as const, 'dining' as const] };
    const result = reconcileOnboarding(request({ answers: full, accountChoice: 'checking', message: 'Travel first, then dining', spending: { status: 'undecided', categories: [] } }), { reply: 'Venture is your demo match.', updates: emptyUpdates, accountChoice: 'checking', spending, confirmed: true });
    expect(result.ready).toBe(true); expect(result.confirmed).toBe(false); expect(result.card?.id).toBe('venture');
    const tangent = reconcileOnboarding(request({ answers: full, accountChoice: 'checking', spending, message: 'What are these points?' }), { reply: 'They’re demo points.', updates: emptyUpdates, accountChoice: 'checking', spending: null, confirmed: false });
    expect(tangent.spending).toEqual(spending); expect(tangent.card?.id).toBe('venture');
    const edited = reconcileOnboarding(request({ answers: full, accountChoice: 'checking', spending, message: 'Actually, dining is most important. Go ahead.' }), { reply: 'Savor is your updated match.', updates: emptyUpdates, accountChoice: 'checking', spending: { status: 'personalize', categories: ['dining', 'travel'] }, confirmed: true });
    expect(edited.card?.id).toBe('savor'); expect(edited.confirmed).toBe(false);
  });
  it('accepts multiple details together and normalizes recognizable state misspellings', () => {
    const result = reconcileOnboarding(request(), { reply: 'Nice to meet you, Ada.', updates: { ...full, state: 'masachusets' }, accountChoice: 'undecided', confirmed: false });
    expect(result.answers).toEqual(full);
    expect(result.ready).toBe(false);
    expect(result.message).toMatch(/checking, savings, both/);
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
    expect(reconcileOnboarding(request({ answers: full, accountChoice: 'both', message: 'Yes, looks good. Go ahead.' }), { reply: 'Let’s go.', updates: emptyUpdates, accountChoice: 'both', confirmed: true }).confirmed).toBe(true);
    expect(reconcileOnboarding(request({ answers: full, accountChoice: 'both', message: 'Yes, but my ZIP is 02138' }), { reply: 'Updated.', updates: { ...emptyUpdates, zip: '02138' }, accountChoice: 'both', confirmed: true }).confirmed).toBe(false);
  });
});
