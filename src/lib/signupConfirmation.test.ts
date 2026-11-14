import { expect, it } from 'vitest';
import { isAddressAffirmative, isAffirmative } from './signupConfirmation';

it('accepts address-specific wording without treating it as whole-profile approval', () => {
  for (const reply of ['that’s my address', 'yes, that is the right address', 'my address is correct']) {
    expect(isAddressAffirmative(reply)).toBe(true);
    expect(isAffirmative(reply)).toBe(false);
  }
  expect(isAddressAffirmative('yes, but my address is different')).toBe(false);
});

it('accepts natural positive replies without a magic phrase', () => {
  for (const reply of ['good', 'good thanks', 'great', 'fine', 'yes', 'yep!', 'Sure', 'Yes please', 'that’s right', 'correct', 'Okay, thanks Eno!', 'Looks good. Let’s go.', 'Absolutely, go ahead', 'Yes it is', 'Yes lets do it', 'yes please create my accounts', 'everything looks good to me', 'please create my profile', 'no problem', 'yes all 3']) expect(isAffirmative(reply), reply).toBe(true);
});
it('never treats questions, edits, negations, or new details as approval', () => {
  for (const reply of ['yes?', 'Yes but change my city', 'not right', 'no', 'wait', 'okay if there are no fees', 'yes 02138', 'yes my address is 20 Main St', 'yes open savings instead', 'no thanks', 'yes tell me more', 'yes can you explain the fees', 'sure remove the card']) expect(isAffirmative(reply), reply).toBe(false);
});
