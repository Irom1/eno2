import { describe, expect, it } from 'vitest';
import { signupInputHints } from './signupInput';

describe('setup input autofill', () => {
  it.each([
    ['What should I call you?', 'given-name'],
    ['And your last name?', 'family-name'],
    ['Please enter your full name.', 'name'],
    ['What is your mailing address?', 'street-address'],
    ['What is your street number and street name?', 'street-address'],
    ['Can you share your street name?', 'street-address'],
    ['What city do you live in?', 'address-level2'],
    ['Pick your state so I can put the address together.', 'address-level1'],
    ['What is your ZIP code?', 'postal-code'],
  ])('offers the appropriate saved information for %s', (prompt, autocomplete) => {
    expect(signupInputHints(prompt)).toMatchObject({ type: 'text', autocomplete, name: autocomplete });
  });

  it('resets after personal-detail prompts, including address confirmation', () => {
    for (const prompt of ['', 'Does that mailing address look correct?', 'Your name is Alex. Which accounts would you like?', 'The address check is taking a break.', 'Does everything look good?']) {
      expect(signupInputHints(prompt)).toMatchObject({ type: 'text', name: 'message', autocomplete: 'off', inputmode: 'text', autocapitalize: 'sentences' });
    }
  });
});
