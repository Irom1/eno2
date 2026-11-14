import { describe, expect, it } from 'vitest';
import type { ChatCard, ChatCardKind } from './cards';
import { followUpsFor } from './followUps';

let seq = 0;

const card = (kind: ChatCardKind, payload: unknown = {}, tool: string = kind): ChatCard => ({
  id: ++seq,
  kind,
  tool,
  payload
});

const loan = (id: string) => ({
  _id: id,
  type: 'Auto Loan',
  status: 'active',
  monthlyPayment: 412,
  amount: 18500,
  creditScore: 742
});

const billsPayload = () => ({
  count: 2,
  items: [
    { _id: 'bill-1', status: 'pending', payment_amount: 1200, payee: 'Rent' },
    { _id: 'bill-2', status: 'pending', payment_amount: 84.2, payee: 'Utility' }
  ]
});

const transaction = (id: string) => ({
  _id: id,
  amount: 24.5,
  description: 'Coffee',
  status: 'completed'
});

const lowercase = (values: string[]) => values.map((value) => value.toLowerCase());

describe('followUpsFor', () => {
  it('suggests adjacent prompts for loans without repeating the loan ask', () => {
    const suggestions = followUpsFor([card('loans', { count: 1, items: [loan('loan-1')] })], 'Show me my loans');

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(4);
    expect(suggestions).toContain('Show me my bills');
    expect(suggestions).toContain('Show my recent transactions');
    expect(lowercase(suggestions)).not.toContain('show me my loans');
  });

  it('pivots away from bills and towards loans', () => {
    const suggestions = followUpsFor([card('bills', billsPayload())], 'Show me my bills');

    expect(suggestions).toContain('Show me my loans');
    expect(lowercase(suggestions)).not.toContain('show me my bills');
  });

  it('offers anomaly review after transactions', () => {
    const suggestions = followUpsFor(
      [card('transactions', { items: [transaction('tx-1'), transaction('tx-2')] })],
      'Show my recent transactions'
    );

    expect(suggestions).toContain('Anything unusual in my transactions?');
  });

  it('offers spending context for rewards and credit account cards', () => {
    const fromRewards = followUpsFor([card('rewards', { totalRewards: 24850, accounts: [] })], 'Show my rewards');
    const fromAccount = followUpsFor([card('account', { balance: 862, type: 'Credit Card' })], 'Show my credit card');

    expect(fromRewards).toContain('Show my spending');
    expect(fromAccount).toContain('Show my spending');
  });

  it('infers loans from an empty conversation prompt', () => {
    const suggestions = followUpsFor([], 'Show me my loans');

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions).toContain('Show me my bills');
    expect(lowercase(suggestions)).not.toContain('show me my loans');
  });

  it('falls back to a four-item generic set with no cards and no intent', () => {
    const suggestions = followUpsFor([], '');

    expect(suggestions).toEqual([
      'Show my accounts',
      "What's due in the next 30 days?",
      'Where did my money go last month?',
      'Show my rewards'
    ]);
  });

  it('merges multiple card kinds, caps at four, and never duplicates', () => {
    const suggestions = followUpsFor(
      [card('loans', { items: [loan('loan-1')] }), card('bills', billsPayload()), card('transactions', { items: [] })],
      'What can you show me?'
    );

    expect(suggestions.length).toBeLessThanOrEqual(4);
    expect(new Set(lowercase(suggestions)).size).toBe(suggestions.length);
  });

  it('never throws on unknown cards, unknown prompts, or malformed input', () => {
    expect(() => followUpsFor([card('unknown', null)], 'Show me my bills')).not.toThrow();
    expect(() => followUpsFor(undefined as unknown as ChatCard[], '')).not.toThrow();
    expect(() => followUpsFor([], '   ')).not.toThrow();
  });

  it('excludes the current prompt case-insensitively and keeps 3-4 items', () => {
    const suggestions = followUpsFor([card('accounts', { items: [] })], 'show my rewards');

    expect(lowercase(suggestions)).not.toContain('show my rewards');
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(4);
  });
});
