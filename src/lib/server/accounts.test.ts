import { describe, expect, it } from 'vitest';
import {
  mergeTransactions,
  normalizeAccount,
  normalizeBill,
  normalizeCustomer,
  normalizeLoan,
  normalizeTransaction,
  recentActivity
} from './accounts';

describe('normalizeCustomer', () => {
  it('normalizes snake_case customer fields and builds a street from parts', () => {
    const customer = normalizeCustomer({
      _id: 'cust-1',
      first_name: 'Maya',
      last_name: 'Chen',
      address: {
        street_number: '42',
        street_name: 'Main St',
        city: 'Cambridge',
        state: 'MA',
        zip: '02138'
      }
    });

    expect(customer).toEqual({
      id: 'cust-1',
      firstName: 'Maya',
      lastName: 'Chen',
      address: {
        street: '42 Main St',
        city: 'Cambridge',
        state: 'MA',
        zip: '02138'
      }
    });
  });

  it('accepts camelCase summary fields', () => {
    expect(
      normalizeCustomer({
        _id: 'cust-2',
        firstName: 'Jordan',
        lastName: 'Lee',
        address: { street: '1 Beacon St', city: 'Boston', state: 'MA', zip: '02108' }
      })
    ).toMatchObject({ id: 'cust-2', firstName: 'Jordan', lastName: 'Lee' });
  });
});

describe('normalizeAccount', () => {
  it('normalizes snake_case account fields and masks nothing', () => {
    expect(
      normalizeAccount({
        _id: 'acct-1',
        type: 'Checking',
        nickname: 'Everyday',
        balance: 4218.129,
        rewards: 12,
        account_number: '123456789',
        customer_id: 'cust-1'
      })
    ).toEqual({
      id: 'acct-1',
      type: 'Checking',
      nickname: 'Everyday',
      balance: 4218.13,
      rewards: 12,
      accountNumber: '123456789',
      customerId: 'cust-1'
    });
  });
});

describe('normalizeBill', () => {
  it('maps snake_case dates and amounts', () => {
    expect(
      normalizeBill({
        _id: 'bill-1',
        status: 'pending',
        payee: 'Rent',
        nickname: 'November rent',
        payment_amount: 1450.005,
        upcoming_payment_date: '2026-12-01',
        recurring_date: 1,
        payment_date: '2026-12-01',
        creation_date: '2026-11-01',
        account_id: 'acct-1'
      })
    ).toEqual({
      id: 'bill-1',
      status: 'pending',
      payee: 'Rent',
      nickname: 'November rent',
      amount: 1450.01,
      upcomingDate: '2026-12-01',
      recurringDay: 1,
      paymentDate: '2026-12-01',
      creationDate: '2026-11-01',
      accountId: 'acct-1'
    });
  });
});

describe('normalizeLoan', () => {
  it('uses the supplied account id and maps credit score/creation date', () => {
    expect(
      normalizeLoan(
        {
          _id: 'loan-1',
          type: 'student',
          status: 'active',
          monthly_payment: 100.555,
          amount: 5000,
          description: 'Tuition',
          credit_score: 742,
          creation_date: '2025-01-01',
          account_id: 'ignored'
        },
        'acct-1'
      )
    ).toEqual({
      id: 'loan-1',
      type: 'student',
      status: 'active',
      monthlyPayment: 100.56,
      amount: 5000,
      description: 'Tuition',
      creditScore: 742,
      creationDate: '2025-01-01',
      accountId: 'acct-1'
    });
  });
});

describe('normalizeTransaction', () => {
  it('normalizes raw transaction fields and keeps the medium', () => {
    expect(
      normalizeTransaction(
        {
          _id: 'tx-1',
          amount: 25.5,
          description: 'COFFEE',
          transaction_date: '2026-11-03',
          status: 'posted',
          medium: 'balance'
        },
        'withdrawal'
      )
    ).toEqual({
      id: 'tx-1',
      kind: 'withdrawal',
      amount: 25.5,
      description: 'COFFEE',
      date: '2026-11-03',
      status: 'posted',
      medium: 'balance'
    });
  });
});

describe('mergeTransactions', () => {
  const deposit = (id: string, amount: number, date: string) => ({
    _id: id,
    amount,
    description: id,
    transaction_date: date,
    status: 'posted'
  });

  it('sorts descending by date and computes running balances newest to oldest', () => {
    const merged = mergeTransactions(
      [deposit('d1', 100, '2026-11-02')],
      [deposit('w1', 25, '2026-11-03'), deposit('w2', 10, '2026-11-01')],
      1000
    );

    expect(merged.map((tx) => tx.id)).toEqual(['w1', 'd1', 'w2']);
    expect(merged.map((tx) => tx.balanceAfter)).toEqual([1000, 1025, 925]);
    expect(merged.map((tx) => tx.kind)).toEqual(['withdrawal', 'deposit', 'withdrawal']);
  });

  it('tie-breaks same-date transactions by id', () => {
    const merged = mergeTransactions(
      [deposit('b1', 10, '2026-11-03')],
      [deposit('a1', 20, '2026-11-03')],
      100
    );
    expect(merged.map((tx) => tx.id)).toEqual(['a1', 'b1']);
  });

  it('returns an empty list for missing arrays', () => {
    expect(mergeTransactions([], [], 500)).toEqual([]);
    expect(mergeTransactions(undefined as unknown as unknown[], null as unknown as unknown[], 0)).toEqual([]);
  });

  it('handles a negative credit-card balance', () => {
    const merged = mergeTransactions(
      [deposit('d1', 30, '2026-11-01')],
      [deposit('w1', 20, '2026-11-02')],
      -100
    );
    expect(merged.map((tx) => tx.balanceAfter)).toEqual([-100, -80]);
  });

  it('limits recent activity and preserves order', () => {
    const merged = mergeTransactions(
      [
        deposit('d1', 10, '2026-11-01'),
        deposit('d2', 20, '2026-11-03'),
        deposit('d3', 30, '2026-11-02')
      ],
      [],
      1000
    );
    expect(recentActivity(merged, 2).map((tx) => tx.id)).toEqual(['d2', 'd3']);
    expect(recentActivity(merged).map((tx) => tx.id)).toEqual(['d2', 'd3', 'd1']);
  });
});
