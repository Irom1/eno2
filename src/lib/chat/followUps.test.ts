import { describe, expect, it } from 'vitest';
import type { EntityCard } from './entityCards';
import { followUpsFor } from './followUps';

let seq = 0;

const card = (kind: EntityCard['kind'], payload: unknown = {}): EntityCard =>
  ({
    id: ++seq,
    entityId: `${kind}:${seq}`,
    kind,
    payload
  }) as EntityCard;

const loan = () => ({
  loanId: 'loan-1',
  type: 'Auto Loan',
  balance: 18500,
  monthlyPayment: 412,
  status: 'active'
});

const bill = (billId: string) => ({
  billId,
  payee: 'Rent',
  amount: 1200,
  dueDate: '2026-11-20',
  status: 'pending'
});

const transaction = (id: string) => ({
  id,
  description: 'Coffee',
  amount: 24.5,
  date: '2026-11-04'
});

const lowercase = (values: string[]) => values.map((value) => value.toLowerCase());

describe('followUpsFor', () => {
  it('suggests adjacent prompts for loans without repeating the loan ask', () => {
    const suggestions = followUpsFor([card('loan', loan())], 'Show me my loans');

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(4);
    expect(suggestions).toContain('Show me my bills');
    expect(suggestions).toContain('Show my recent transactions');
    expect(lowercase(suggestions)).not.toContain('show me my loans');
  });

  it('pivots away from bills and towards loans', () => {
    const suggestions = followUpsFor([card('bill', bill('bill-1'))], 'Show me my bills');

    expect(suggestions).toContain('Show me my loans');
    expect(lowercase(suggestions)).not.toContain('show me my bills');
  });

  it('offers anomaly review after transactions', () => {
    const suggestions = followUpsFor(
      [card('transaction-list', { rows: [transaction('tx-1'), transaction('tx-2')], more: 0 })],
      'Show my recent transactions'
    );

    expect(suggestions).toContain('Anything unusual in my transactions?');
  });

  it('offers spending context for reward cards and accounts for account cards', () => {
    const fromRewards = followUpsFor(
      [card('reward', { rewardId: 'reward-1', label: 'Venture', points: 24850 })],
      'Show my rewards'
    );
    const fromAccount = followUpsFor(
      [
        card('account', {
          accountId: 'acct-card',
          nickname: 'Venture',
          type: 'Credit Card',
          maskedNumber: '•••• 9964',
          balance: 862,
          rewards: 24850
        })
      ],
      'Show my credit card'
    );

    expect(fromRewards).toContain('Show my spending');
    expect(fromAccount).toContain('Show my rewards');
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
      [
        card('loan', loan()),
        card('bill', bill('bill-1')),
        card('transaction-list', { rows: [], more: 0 })
      ],
      'What can you show me?'
    );

    expect(suggestions.length).toBeLessThanOrEqual(4);
    expect(new Set(lowercase(suggestions)).size).toBe(suggestions.length);
  });

  it('never throws on malformed cards, unknown prompts, or malformed input', () => {
    expect(() => followUpsFor([null as unknown as EntityCard], 'Show me my bills')).not.toThrow();
    expect(() => followUpsFor(undefined as unknown as EntityCard[], '')).not.toThrow();
    expect(() => followUpsFor([], '   ')).not.toThrow();
  });

  it('excludes the current prompt case-insensitively and keeps 3-4 items', () => {
    const suggestions = followUpsFor(
      [
        card('account', {
          accountId: 'acct-checking',
          nickname: 'Everyday Checking',
          type: 'Checking',
          maskedNumber: '•••• 4212',
          balance: 4218,
          rewards: 0
        })
      ],
      'show my rewards'
    );

    expect(lowercase(suggestions)).not.toContain('show my rewards');
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(4);
  });
});
