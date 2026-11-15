import { expect, it } from 'vitest';
import { createSession } from './session';
import { resolveTransactionReference } from './transactionContext';

function conversation() {
  const session = createSession({ id: 'maya', firstName: 'Maya', lastName: 'Chen' }, [{ id: 'checking', type: 'Checking', nickname: 'Checking', balance: 1000, rewards: 0, accountNumber: '' }]);
  session.contents = [
    { role: 'user', parts: [{ text: 'Show my transactions at LOCAL COFFEE' }] },
    { role: 'model', parts: [{ functionCall: { name: 'insight_top_transactions', args: { accountId: 'checking', merchant: 'LOCAL COFFEE' } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'insight_top_transactions', response: { result: { items: [{ _id: 'large-coffee', description: 'LOCAL COFFEE', amount: 159 }, { _id: 'small-coffee', description: 'LOCAL COFFEE', amount: 10 }] } } } }] },
    { role: 'model', parts: [{ text: 'Here are the matching transactions.' }] }
  ];
  return session;
}

it('resolves displayed ordinals and merchant/amount references to actual owned ids', () => {
  const session = conversation();
  expect(resolveTransactionReference('is that first one suspicious', session)).toMatchObject({ id: 'large-coffee', accountId: 'checking', amount: 159 });
  expect(resolveTransactionReference('What about the second one?', session)?.id).toBe('small-coffee');
  expect(resolveTransactionReference('Is the $159 LOCAL COFFEE purchase suspicious?', session)?.id).toBe('large-coffee');
});

it('does not guess an ambiguous charge, an unavailable row, or a stale topic', () => {
  const session = conversation();
  expect(resolveTransactionReference('Is that suspicious?', session)).toBeNull();
  expect(resolveTransactionReference('Is LOCAL COFFEE suspicious?', session)).toBeNull();
  expect(resolveTransactionReference('Is the third one suspicious?', session)).toBeNull();
  session.contents.push({ role: 'user', parts: [{ functionResponse: { name: 'insight_upcoming_bills', response: { result: { bills: [] } } } }] });
  expect(resolveTransactionReference('Is the first one suspicious?', session)).toBeNull();
});
