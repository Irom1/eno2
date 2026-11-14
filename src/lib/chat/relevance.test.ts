import { describe, expect, it } from 'vitest';
import type { ChatCard, ChatCardKind } from './cards';
import {
  allowedKindsFor,
  classifyIntents,
  isCardEmpty,
  visibleCards
} from './relevance';

let seq = 0;

const card = (kind: ChatCardKind, payload: unknown, tool: string = kind): ChatCard => ({
  id: ++seq,
  kind,
  tool,
  payload
});

const account = (overrides: Record<string, unknown> = {}) => ({
  _id: 'acct-1',
  type: 'Checking',
  nickname: 'Everyday Checking',
  balance: 4218,
  rewards: 0,
  accountNumber: '•••• 6726',
  ...overrides
});

const overviewCard = () =>
  card(
    'overview',
    {
      asOf: '2026-11-14T00:00:00.000Z',
      accounts: [account()],
      liquidTotal: 16858,
      cardBalances: 862,
      totalRewards: 24850,
      cashflow90Days: { inflow: 12234, outflow: 7274, net: 4960 },
      savingsRate: 0.41,
      monthlyCashflow: [
        { month: '2026-09', inflow: 4800, outflow: 1945, net: 2855 },
        { month: '2026-10', inflow: 5034, outflow: 2470, net: 2564 }
      ],
      upcomingBills: { total: 4283.59, count: 8 },
      loanObligations: { monthlyPayment: 592, count: 2 }
    },
    'insight_financial_overview'
  );

const loansCard = (items: unknown[]) =>
  card('loans', { count: items.length, truncated: false, items }, 'nessie_list_account_loans');

const loan = (id: string) => ({
  _id: id,
  type: 'Auto Loan',
  status: 'active',
  monthlyPayment: 412,
  amount: 18500,
  creditScore: 742
});

const billsCard = () =>
  card(
    'bills',
    {
      count: 1,
      total: 1800,
      bills: [
        {
          billId: 'bill-1',
          payee: 'MIT Bursar',
          amount: 1800,
          dueDate: '2026-12-05',
          status: 'pending'
        }
      ]
    },
    'insight_upcoming_bills'
  );

const accountsCard = () =>
  card(
    'accounts',
    { count: 1, truncated: false, items: [account()] },
    'nessie_list_customer_accounts'
  );

const creditAccountCard = () =>
  card(
    'account',
    {
      _id: 'acct-card',
      type: 'Credit Card',
      nickname: 'Venture Rewards',
      balance: 862,
      rewards: 24850,
      accountNumber: '•••• 9964'
    },
    'nessie_get_account'
  );

describe('classifyIntents', () => {
  it('classifies a specific loans question only', () => {
    const intents = classifyIntents('Show me my loans');
    expect([...intents]).toEqual(['loans']);
    expect(allowedKindsFor(intents).has('overview')).toBe(false);
    expect(allowedKindsFor(intents).has('loans')).toBe(true);
  });

  it('unions multiple intents', () => {
    const intents = classifyIntents('Show me my credit card rewards');
    expect(intents.has('credit')).toBe(true);
    expect(intents.has('rewards')).toBe(true);
    const kinds = allowedKindsFor(intents);
    expect(kinds.has('account')).toBe(true);
    expect(kinds.has('accounts')).toBe(true);
    expect(kinds.has('rewards')).toBe(true);
  });

  it('returns an empty set for an unknown prompt', () => {
    expect(classifyIntents('Tell me something interesting').size).toBe(0);
    expect(allowedKindsFor(new Set()).size).toBe(0);
  });
});

describe('isCardEmpty', () => {
  it('detects empty and populated list cards', () => {
    expect(isCardEmpty(loansCard([]))).toBe(true);
    expect(isCardEmpty(loansCard([loan('loan-1')]))).toBe(false);
    expect(isCardEmpty(billsCard())).toBe(false);
    expect(isCardEmpty(overviewCard())).toBe(false);
    expect(isCardEmpty(card('goal', { targetAmount: 0 }))).toBe(true);
    expect(isCardEmpty(card('goal', { targetAmount: 5000 }))).toBe(false);
  });
});

describe('visibleCards', () => {
  it('collapses the loans regression from 7 cards to one populated loan card', () => {
    const cards = [
      overviewCard(),
      loansCard([loan('loan-1'), loan('loan-2')]),
      loansCard([]),
      loansCard([])
    ];

    const shown = visibleCards(cards, 'Show me my loans');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.kind).toBe('loans');
    expect((shown[0]?.payload as { items: unknown[] }).items).toHaveLength(2);
    expect(shown.some((entry) => entry.kind === 'overview')).toBe(false);
  });

  it('keeps one empty loans card when every loan result is empty', () => {
    const shown = visibleCards([loansCard([]), loansCard([]), loansCard([])], 'Show me my loans');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.kind).toBe('loans');
    expect(isCardEmpty(shown[0]!)).toBe(true);
  });

  it('shows only bills for a bills question', () => {
    const shown = visibleCards([overviewCard(), billsCard(), loansCard([loan('l')])], 'Show me my bills');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.kind).toBe('bills');
  });

  it('keeps the account card and overview for a credit rewards question', () => {
    const shown = visibleCards([overviewCard(), creditAccountCard()], 'Show me my credit card rewards');
    expect(shown.map((entry) => entry.kind)).toEqual(['overview', 'account']);
  });

  it('keeps the overview card for cashflow while allowed kinds contains only cashflow', () => {
    const intents = classifyIntents('Show me my cashflow');
    const kinds = allowedKindsFor(intents);
    expect([...kinds]).toEqual(['cashflow']);

    const shown = visibleCards([overviewCard()], 'Show me my cashflow');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.kind).toBe('overview');
  });

  it('allows both overview and raw account cards for an accounts question', () => {
    const kinds = allowedKindsFor(classifyIntents('Show me my accounts'));
    expect(kinds.has('overview')).toBe(false);
    expect(kinds.has('accounts')).toBe(true);
    expect(kinds.has('account')).toBe(true);

    const shown = visibleCards([overviewCard(), accountsCard()], 'Show me my accounts');
    expect(shown.map((entry) => entry.kind)).toEqual(['overview', 'accounts']);
  });

  it('keeps all cards (minus empty duplicates) when the prompt has no intent', () => {
    const shown = visibleCards(
      [overviewCard(), loansCard([loan('l')]), loansCard([]), loansCard([])],
      'Tell me something interesting'
    );
    expect(shown.map((entry) => entry.kind)).toEqual(['overview', 'loans']);
    expect(shown.filter((entry) => entry.kind === 'loans')).toHaveLength(1);
    expect(isCardEmpty(shown[1]!)).toBe(false);
  });

  it('drops irrelevant empty cards entirely', () => {
    const shown = visibleCards(
      [overviewCard(), billsCard(), loansCard([])],
      'Show me my loans'
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]?.kind).toBe('loans');
    expect(shown[0] && isCardEmpty(shown[0])).toBe(true);
  });

  it('dedupes identical kind and payload cards', () => {
    const first = loansCard([loan('l')]);
    const duplicate = { ...first, id: ++seq };
    const shown = visibleCards([first, duplicate], 'Show me my loans');
    expect(shown).toHaveLength(1);
  });
});
