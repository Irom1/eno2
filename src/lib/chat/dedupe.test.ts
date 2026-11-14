import { describe, expect, it } from 'vitest';
import type { ChatCard } from './cards';
import { cardTokens, filterCardDuplication } from './dedupe';

const card = (payload: unknown, tool = 'nessie_get_account', kind: ChatCard['kind'] = 'account'): ChatCard => ({
  id: 1,
  kind,
  tool,
  payload
});

describe('filterCardDuplication', () => {
  it('removes prose that only restates card values', () => {
    const cards = [
      card({
        type: 'Credit Card',
        nickname: 'Venture Rewards',
        balance: 50,
        accountNumber: '•••• 1234',
        rewards: 100
      })
    ];

    expect(
      filterCardDuplication(
        'Your card is Venture Rewards with a $50 balance and 100 rewards points.',
        cards
      )
    ).toBe('');
  });

  it('keeps a generic sentence that adds no card data', () => {
    const cards = [
      card({
        type: 'Credit Card',
        nickname: 'Venture Rewards',
        balance: 50,
        accountNumber: '•••• 1234',
        rewards: 100
      })
    ];

    expect(
      filterCardDuplication(
        'Your card is Venture Rewards with a $50 balance. It is your only card.',
        cards
      )
    ).toBe('It is your only card.');
  });

  it('returns text unchanged when there are no cards', () => {
    const text = 'Your balance is $50 and this stays exactly as written.';
    expect(filterCardDuplication(text, [])).toBe(text);
  });

  it('removes transaction rows but keeps the comparison', () => {
    const cards = [
      card(
        {
          items: [
            {
              description: 'NETFLIX.COM',
              amount: 15,
              date: '2026-10-06',
              status: 'completed'
            }
          ]
        },
        'nessie_list_account_withdrawals',
        'transactions'
      )
    ];

    expect(
      filterCardDuplication(
        'You were charged $15 at NETFLIX.COM on Oct 6. That is the only duplicate.',
        cards
      )
    ).toBe('That is the only duplicate.');
  });

  it('matches money variants with comma grouping and without', () => {
    const cards = [card({ balance: 4218 })];
    for (const text of [
      'Your balance is $4,218.',
      'Your balance is 4218.',
      'Your balance is 4,218.'
    ]) {
      expect(filterCardDuplication(text, cards)).toBe('');
    }
  });

  it('matches a masked account ending', () => {
    const cards = [card({ accountNumber: '•••• 6726' })];
    expect(filterCardDuplication('It ends in 6726.', cards)).toBe('');
  });

  it('preserves comparisons that contain no card token', () => {
    const cards = [card({ balance: 50 })];
    expect(
      filterCardDuplication('You spent less than last month.', cards)
    ).toBe('You spent less than last month.');
  });

  it('preserves bullet markers for kept lines and drops matching ones', () => {
    const cards = [card({ balance: 50 })];
    expect(
      filterCardDuplication(
        '- Your balance is $50.\n- This card is your daily driver.',
        cards
      )
    ).toBe('- This card is your daily driver.');
  });

  it('is defensive on empty, whitespace and unknown payloads', () => {
    const cards = [card(null)];
    expect(filterCardDuplication('', cards)).toBe('');
    expect(filterCardDuplication('   ', cards)).toBe('   ');
    expect(filterCardDuplication('Something unrelated.', cards)).toBe('Something unrelated.');
    expect(filterCardDuplication('Something unrelated.', [card(undefined)])).toBe(
      'Something unrelated.'
    );
  });

  it('collects numbers, dates, endings and visible text tokens', () => {
    const tokens = cardTokens([
      card({
        balance: 4218,
        dueDate: '2026-12-05',
        accountNumber: '•••• 6726',
        nickname: 'Venture Rewards',
        status: 'completed'
      })
    ]);

    for (const expected of [
      '4218',
      '4,218',
      '$4,218',
      '2026-12-05',
      'Dec 5',
      '6726',
      'venture',
      'completed'
    ]) {
      expect(tokens.has(expected)).toBe(true);
    }
  });
});
