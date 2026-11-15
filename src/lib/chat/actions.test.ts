import { expect, test } from 'vitest';
import { chatAction } from './actions';

test.each([
  'Add a new account',
  'I want to open an account',
  'Could you help me create another savings account?',
  'Hey Eno, I’d like to apply for a credit card, please.'
])('recognizes account opening in %j', (prompt) => {
  expect(chatAction(prompt)).toBe('open-account');
});

test.each(['Sign out', 'Please log me out', 'Can you sign me out?', 'I want to log out of my account.'])(
  'recognizes sign-out in %j',
  (prompt) => expect(chatAction(prompt)).toBe('sign-out')
);

test.each([
  'Show my savings account',
  'What happens if I open another account?',
  'Do not open a new account',
  'How do I sign out?',
  "Don't sign me out"
])('keeps ordinary chat messages in chat for %j', (prompt) => {
  expect(chatAction(prompt)).toBeUndefined();
});
