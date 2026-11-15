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

const transaction = (id: string, description = 'Coffee') => ({
  id,
  description,
  amount: 24.5,
  date: '2026-11-04'
});

const pie = (labels: string[]) => ({
  period: 'October 2026',
  total: 2470,
  slices: labels.map((label, index) => ({
    label,
    amount: 2470 / labels.length,
    share: 1 / labels.length,
    index
  }))
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

  it('asks whether the rendered bill can be covered', () => {
    const suggestions = followUpsFor([card('bill', bill('bill-rent'))], 'Show me my bills');

    expect(suggestions).toContain('Can I cover my Rent bill?');
  });

  it('offers anomaly review after transactions', () => {
    const suggestions = followUpsFor(
      [card('transaction-list', { rows: [transaction('tx-1'), transaction('tx-2')], more: 0 })],
      'Show my recent transactions'
    );

    expect(suggestions).toContain('Anything unusual in my transactions?');
  });

  it('names the first transaction merchant from a transaction list', () => {
    const suggestions = followUpsFor(
      [
        card('transaction-list', {
          rows: [transaction('tx-1', 'WHOLE FOODS MKT'), transaction('tx-2')],
          more: 0
        })
      ],
      'Show my recent transactions'
    );

    expect(suggestions).toContain('Show my transactions at WHOLE FOODS MKT');
  });

  it('names the merchant for a merchant card', () => {
    const suggestions = followUpsFor(
      [card('merchant', { merchantId: 'merchant-1', name: 'Whole Foods', category: 'groceries' })],
      'Where do I shop most?'
    );

    expect(suggestions).toContain('Show my transactions at Whole Foods');
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

  it('suggests the top spending category and a comparison', () => {
    const suggestions = followUpsFor(
      [card('spending-pie', pie(['housing', 'groceries', 'shopping']))],
      'Where did my money go last month?'
    );

    expect(suggestions).toContain('Show my housing transactions');
    expect(suggestions).toContain('Compare this month to last month');
  });

  it('uses the singular grocery wording for a groceries pie', () => {
    const suggestions = followUpsFor(
      [card('spending-pie', pie(['groceries']))],
      'Where did my money go last month?'
    );

    expect(suggestions).toContain('Show my grocery transactions');
  });

  it('suggests climate follow-ups from the top emitting category', () => {
    const suggestions = followUpsFor(
      [
        card('climatewise', {
          score: 712,
          tier: 'Good',
          totalKg: 412.35,
          days: 90,
          topCategory: 'Travel & transport'
        })
      ],
      "What's my ClimateWise score?"
    );

    expect(suggestions).toContain('How can I lower my Travel & transport emissions?');
    expect(suggestions).toContain('Show my top emitting purchases');
    expect(suggestions).toContain('Where did my emissions come from?');
    expect(suggestions).toContain('Show my spending');
    expect(lowercase(suggestions)).not.toContain("what's my climatewise score?");
  });

  it('falls back to climate suggestions without a top category', () => {
    const suggestions = followUpsFor(
      [card('climatewise', { score: 712, tier: 'Good', totalKg: 412.35, days: 90 })],
      'Tell me about my footprint'
    );

    expect(suggestions).toContain('Show my top emitting purchases');
    expect(suggestions).toContain('Where did my emissions come from?');
  });

  it('asks whether the rendered subscription is still active', () => {
    const suggestions = followUpsFor(
      [
        card('recurring', {
          chargeId: 'charge-1',
          description: 'Netflix',
          averageAmount: 19.99,
          monthsSeen: 6,
          lastDate: '2026-11-01'
        })
      ],
      'Show me my recurring payments'
    );

    expect(suggestions).toContain('Is my Netflix subscription still active?');
  });

  it('offers another ATM near Arlington for an ATM card', () => {
    const suggestions = followUpsFor(
      [
        card('location', {
          locationId: 'atm-1',
          name: 'Arlington ATM',
          address: '',
          type: 'atm'
        })
      ],
      'Find an ATM near Arlington, VA'
    );

    expect(suggestions).toContain('Find another ATM near Arlington, VA');
  });

  it('offers another branch for a branch card', () => {
    const suggestions = followUpsFor(
      [
        card('location', {
          locationId: 'branch-1',
          name: 'Clarendon Branch',
          address: '1 Main St, Arlington, VA',
          type: 'branch'
        })
      ],
      'Find a branch in Arlington'
    );

    expect(suggestions).toContain('Find another branch near Arlington');
  });

  it('answers an account clarification with the loaded account names', () => {
    const suggestions = followUpsFor(
      [],
      '',
      'Which account would you like to analyze?',
      [
        { id: 'acct-checking', nickname: 'Everyday Checking', type: 'Checking' },
        { id: 'acct-savings', nickname: 'Savings', type: 'Savings' },
        { id: 'acct-venture', nickname: 'Venture', type: 'Credit Card' }
      ]
    );

    expect(suggestions).toContain('Show my Everyday Checking transactions');
  });

  it('falls back to generic account wording when no accounts are loaded', () => {
    const suggestions = followUpsFor([], '', 'Which card would you like to analyze?');

    expect(suggestions).toContain('Show my checking transactions');
  });

  it('answers a target-amount clarification with concrete savings targets', () => {
    const suggestions = followUpsFor(
      [],
      '',
      'What target amount would you like to save for?'
    );

    expect(suggestions).toContain('How long to save $1,000?');
  });

  it('answers a category clarification from the spending pie', () => {
    const suggestions = followUpsFor(
      [card('spending-pie', pie(['housing', 'groceries', 'shopping']))],
      '',
      'Which category?'
    );

    expect(suggestions).toContain('Show my housing transactions');
  });

  it('answers a charge clarification from the transaction cards', () => {
    const suggestions = followUpsFor(
      [
        card('transaction', {
          description: 'NETFLIX.COM',
          amount: 15.49,
          date: '2026-11-02',
          transactionId: 'txn-netflix'
        }),
        card('transaction', {
          description: 'APPLE STORE',
          amount: 1299,
          date: '2026-11-03',
          transactionId: 'txn-apple'
        })
      ],
      '',
      'Which charge?'
    );

    expect(suggestions).toContain('Show my transactions at NETFLIX.COM');
  });

  it('answers a yes/no clarification', () => {
    const suggestions = followUpsFor([], '', 'Would you like to see the details?');

    expect(suggestions).toContain('Yes, show me the details');
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
    expect(() =>
      followUpsFor(
        [card('bill', null)],
        '',
        'Which account?',
        [null as unknown as { nickname: string }]
      )
    ).not.toThrow();
    expect(() =>
      followUpsFor([card('spending-pie', { slices: 'nope' })], '', 'Which category?')
    ).not.toThrow();
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

  it('never repeats the asked prompt even when a card template matches it', () => {
    const suggestions = followUpsFor([card('bill', bill('bill-1'))], 'Show me my loans');

    expect(lowercase(suggestions)).not.toContain('show me my loans');
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('does not suggest actions the app cannot perform', () => {
    const suggestions = followUpsFor(
      [
        card('bill', bill('bill-1')),
        card('recurring', {
          chargeId: 'charge-1',
          description: 'Netflix',
          averageAmount: 19.99,
          monthsSeen: 6,
          lastDate: '2026-11-01'
        })
      ],
      'Show me my bills'
    );

    for (const suggestion of suggestions) {
      expect(suggestion.toLowerCase()).not.toMatch(
        /pay (?:my|the|this)|set (?:an? )?alert|change (?:my )?limit|cancel|directions/
      );
    }
  });
});
