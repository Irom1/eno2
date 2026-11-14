import { describe, expect, it } from 'vitest';
import type { Session } from './session';
import {
  collectCardCandidates,
  resolvePresentCard,
  type CardCandidate
} from './presentCard';

const session: Session = {
  id: 'session-1',
  customer: { id: 'cust-1', firstName: 'Maya', lastName: 'Chen' },
  accounts: [
    {
      id: 'acct-1',
      type: 'Checking',
      nickname: 'Everyday',
      balance: 4218,
      rewards: 0,
      accountNumber: '****1234'
    }
  ],
  contents: [],
  createdAt: 0,
  updatedAt: 0
};

const accountRow = {
  _id: 'acct-1',
  type: 'Checking',
  nickname: 'Everyday',
  balance: 4218,
  rewards: 0,
  accountNumber: '•••• 1234',
  customerId: 'cust-1',
  extra: 'do not leak'
};

describe('collectCardCandidates', () => {
  it('collects each account row as its own candidate', () => {
    const candidates = collectCardCandidates(
      'nessie_list_customer_accounts',
      {},
      { count: 2, items: [accountRow, { ...accountRow, _id: 'acct-2' }] },
      session
    );
    expect(candidates.map((candidate) => [candidate.kind, candidate.id])).toEqual([
      ['account', 'acct-1'],
      ['account', 'acct-2']
    ]);
  });

  it('collects a single account from nessie_get_account', () => {
    const candidates = collectCardCandidates('nessie_get_account', {}, accountRow, session);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'account', id: 'acct-1' });
  });

  it('normalizes insight bills to amount, due date, and account id', () => {
    const candidates = collectCardCandidates(
      'insight_upcoming_bills',
      {},
      {
        count: 1,
        bills: [
          {
            billId: 'bill-1',
            payee: 'MIT Bursar',
            paymentAmount: 1800,
            upcomingPaymentDate: '2026-12-05',
            status: 'pending',
            accountId: 'acct-1'
          }
        ]
      },
      session
    );
    expect(candidates[0]).toMatchObject({ kind: 'bill', id: 'bill-1', accountId: 'acct-1' });
    expect(candidates[0].record).toMatchObject({
      billId: 'bill-1',
      amount: 1800,
      dueDate: '2026-12-05',
      accountId: 'acct-1'
    });
  });

  it('collects raw loans with camel-cased payment fields and ownership', () => {
    const candidates = collectCardCandidates(
      'nessie_list_account_loans',
      { accountId: 'acct-1' },
      {
        count: 1,
        items: [
          {
            _id: 'loan-1',
            type: 'Auto',
            monthly_payment: 412,
            amount: 18400,
            account_id: 'acct-1'
          }
        ]
      },
      session
    );
    expect(candidates[0]).toMatchObject({ kind: 'loan', id: 'loan-1', accountId: 'acct-1' });
    expect(candidates[0].record).toMatchObject({ monthlyPayment: 412, amount: 18400 });
  });

  it('takes the transaction account id from the tool args', () => {
    const candidates = collectCardCandidates(
      'nessie_list_account_withdrawals',
      { accountId: 'acct-1' },
      {
        count: 1,
        items: [
          {
            _id: 'txn-1',
            description: 'APPLE',
            amount: 1299,
            transaction_date: '2026-11-03'
          }
        ]
      },
      session
    );
    expect(candidates[0]).toMatchObject({
      kind: 'transaction',
      id: 'txn-1',
      accountId: 'acct-1'
    });
    expect(candidates[0].record).toMatchObject({ transactionDate: '2026-11-03' });
  });

  it('collects public merchants and locations', () => {
    const merchants = collectCardCandidates(
      'nessie_list_merchants',
      {},
      { count: 1, items: [{ _id: 'mer-1', name: 'Apple' }] },
      session
    );
    const locations = collectCardCandidates(
      'find_nearby_branches',
      {},
      { count: 1, results: [{ _id: 'loc-1', name: 'Main Branch' }] },
      session
    );
    expect(merchants[0]).toMatchObject({ kind: 'merchant', id: 'mer-1' });
    expect(locations[0]).toMatchObject({ kind: 'location', id: 'loc-1' });
  });

  it('collects only the session customer profile', () => {
    const candidates = collectCardCandidates(
      'nessie_get_customer',
      {},
      {
        count: 2,
        items: [
          { _id: 'cust-1', firstName: 'Maya', lastName: 'Chen' },
          { _id: 'cust-2', firstName: 'Other', lastName: 'Person' }
        ]
      },
      session
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(['cust-1']);
  });

  it('drops duplicate candidates by kind and id', () => {
    const candidates = collectCardCandidates(
      'nessie_list_customer_accounts',
      {},
      { count: 2, items: [accountRow, accountRow] },
      session
    );
    expect(candidates).toHaveLength(1);
  });

  it('returns no candidates for unsupported tools', () => {
    expect(
      collectCardCandidates('insight_spending_breakdown', {}, { categories: [] }, session)
    ).toEqual([]);
  });
});

describe('resolvePresentCard', () => {
  function collect(toolName: string, args: Record<string, unknown>, payload: unknown) {
    return collectCardCandidates(toolName, args, payload, session);
  }

  it('accepts an owned account and returns a whitelisted copy', () => {
    const candidates = collect('nessie_get_account', {}, accountRow);
    const card = resolvePresentCard(candidates, 'account', 'acct-1', session);
    expect(card).toMatchObject({
      kind: 'account',
      entityId: 'account:acct-1',
      afterText: 0,
      payload: {
        accountId: 'acct-1',
        nickname: 'Everyday',
        type: 'Checking',
        maskedNumber: '•••• 1234',
        balance: 4218,
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card?.payload ?? {})).not.toContain('extra');
    expect(JSON.stringify(card)).not.toContain('do not leak');
  });

  it('rejects an account that is not in the session', () => {
    const candidates = collect('nessie_list_customer_accounts', {}, {
      count: 1,
      items: [{ ...accountRow, _id: 'acct-foreign' }]
    });
    expect(resolvePresentCard(candidates, 'account', 'acct-foreign', session)).toBeNull();
  });

  it('accepts an owned bill', () => {
    const candidates = collect('insight_upcoming_bills', {}, {
      bills: [
        {
          billId: 'bill-1',
          payee: 'MIT Bursar',
          amount: 1800,
          dueDate: '2026-12-05',
          status: 'pending',
          accountId: 'acct-1'
        }
      ]
    });
    const card = resolvePresentCard(candidates, 'bill', 'bill-1', session);
    expect(card).toMatchObject({
      kind: 'bill',
      entityId: 'bill-1',
      payload: { billId: 'bill-1', payee: 'MIT Bursar', amount: 1800, accountId: 'acct-1' }
    });
  });

  it('rejects a bill from another account or with no account id', () => {
    const foreign = collect('insight_upcoming_bills', {}, {
      bills: [{ billId: 'bill-f', payee: 'Other', amount: 1, dueDate: '2026-12-05', accountId: 'acct-x' }]
    });
    expect(resolvePresentCard(foreign, 'bill', 'bill-f', session)).toBeNull();

    const missing = collect('insight_upcoming_bills', {}, {
      bills: [{ billId: 'bill-m', payee: 'Other', amount: 1, dueDate: '2026-12-05' }]
    });
    expect(resolvePresentCard(missing, 'bill', 'bill-m', session)).toBeNull();
  });

  it('accepts an owned loan and an owned transaction', () => {
    const loans = collect('nessie_list_account_loans', { accountId: 'acct-1' }, {
      items: [
        {
          _id: 'loan-1',
          type: 'Auto',
          monthlyPayment: 412,
          amount: 18400,
          accountId: 'acct-1'
        }
      ]
    });
    expect(resolvePresentCard(loans, 'loan', 'loan-1', session)).toMatchObject({
      kind: 'loan',
      entityId: 'loan:loan-1'
    });

    const transactions = collect(
      'nessie_list_account_withdrawals',
      { accountId: 'acct-1' },
      {
        items: [
          {
            _id: 'txn-1',
            description: 'APPLE',
            amount: 1299,
            transactionDate: '2026-11-03'
          }
        ]
      }
    );
    const card = resolvePresentCard(transactions, 'transaction', 'txn-1', session);
    expect(card).toMatchObject({
      kind: 'transaction',
      entityId: 'txn-1',
      payload: {
        description: 'APPLE',
        amount: 1299,
        date: '2026-11-03',
        transactionId: 'txn-1',
        accountId: 'acct-1',
        customerId: 'cust-1'
      }
    });
  });

  it('rejects a transaction with no owning account', () => {
    const candidates = collect('nessie_get_purchase', {}, {
      _id: 'txn-1',
      description: 'APPLE',
      amount: 1299,
      transactionDate: '2026-11-03'
    });
    expect(resolvePresentCard(candidates, 'transaction', 'txn-1', session)).toBeNull();
  });

  it('allows public merchants and locations', () => {
    const merchants = collect('nessie_get_merchant', {}, {
      _id: 'mer-1',
      name: 'Apple',
      category: 'Electronics',
      address: { street: '1 Main', city: 'Arlington', state: 'VA', zip: '22201' }
    });
    const merchant = resolvePresentCard(merchants, 'merchant', 'mer-1', session);
    expect(merchant).toMatchObject({ kind: 'merchant', entityId: 'merchant:mer-1' });
    expect(Object.keys(merchant?.payload ?? {})).not.toContain('zip');

    const locations = collect('find_nearby_atms', {}, {
      results: [
        { _id: 'atm-1', name: 'ATM One', lat: 38.88, lng: -77.1 }
      ]
    });
    expect(resolvePresentCard(locations, 'location', 'atm-1', session)).toMatchObject({
      kind: 'location',
      entityId: 'location:atm-1',
      payload: { type: 'atm', lat: 38.88, lng: -77.1 }
    });

    const branches = collect('find_nearby_branches', {}, {
      results: [
        {
          _id: 'branch-1',
          name: 'Branch One',
          address: { street: '1 Main', city: 'Arlington', state: 'VA', zip: '22201' },
          lat: 38.9,
          lng: -77.2
        }
      ]
    });
    expect(resolvePresentCard(branches, 'location', 'branch-1', session)).toMatchObject({
      kind: 'location',
      payload: { type: 'branch', address: '1 Main, Arlington, VA 22201' }
    });
  });

  it('accepts the session profile and rejects another customer profile', () => {
    const candidates = collect('nessie_get_customer', {}, {
      items: [
        {
          _id: 'cust-1',
          firstName: 'Maya',
          lastName: 'Chen',
          address: { street: '1 Main', city: 'Arlington', state: 'VA', zip: '22201' }
        }
      ]
    });
    const card = resolvePresentCard(candidates, 'profile', 'cust-1', session);
    expect(card).toMatchObject({
      kind: 'profile',
      entityId: 'profile:cust-1',
      payload: { customerId: 'cust-1', name: 'Maya Chen', location: 'Arlington, VA' }
    });
    expect(Object.keys(card?.payload ?? {})).not.toContain('street');
    expect(Object.keys(card?.payload ?? {})).not.toContain('zip');

    const forged: CardCandidate[] = [
      {
        kind: 'profile',
        id: 'cust-2',
        record: { _id: 'cust-2', firstName: 'Other', lastName: 'Person' }
      }
    ];
    expect(resolvePresentCard(forged, 'profile', 'cust-2', session)).toBeNull();
  });

  it('rejects an unknown id, a kind mismatch, and malformed input', () => {
    const candidates = collect('nessie_get_account', {}, accountRow);
    expect(resolvePresentCard(candidates, 'account', 'acct-unknown', session)).toBeNull();
    expect(resolvePresentCard(candidates, 'loan', 'acct-1', session)).toBeNull();
    expect(resolvePresentCard(candidates, 'unknown', 'acct-1', session)).toBeNull();
    expect(resolvePresentCard([], '', '', session)).toBeNull();
    expect(
      resolvePresentCard(null as unknown as CardCandidate[], 'account', 'acct-1', session)
    ).toBeNull();
  });
});
