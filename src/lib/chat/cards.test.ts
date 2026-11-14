import { describe, expect, it } from 'vitest';
import {
  asItems,
  asRecord,
  CARD_KINDS,
  CHAT_CARD_KINDS,
  cardLabel,
  chatCardKind,
  transactionKind,
  type ChatCardKind
} from './cards';

const EXPECTED: Record<string, ChatCardKind> = {
  insight_financial_overview: 'overview',
  insight_spending_breakdown: 'spending',
  insight_upcoming_bills: 'bills',
  insight_recurring_charges: 'recurring',
  insight_anomalies: 'anomalies',
  insight_goal_projection: 'goal',
  find_nearby_atms: 'locations',
  find_nearby_branches: 'locations',
  nessie_list_customers: 'customer',
  nessie_get_customer: 'customer',
  nessie_get_account_customer: 'customer',
  nessie_list_customer_accounts: 'accounts',
  nessie_get_account: 'account',
  nessie_list_customer_bills: 'bills',
  nessie_list_account_bills: 'bills',
  nessie_get_bill: 'bills',
  nessie_list_account_deposits: 'transactions',
  nessie_list_account_withdrawals: 'transactions',
  nessie_get_deposit: 'transaction',
  nessie_get_withdrawal: 'transaction',
  nessie_get_purchase: 'transaction',
  nessie_get_transfer: 'transaction',
  nessie_list_account_loans: 'loans',
  nessie_get_loan: 'loans',
  nessie_list_merchants: 'merchants',
  nessie_get_merchant: 'merchants',
  nessie_list_atms: 'locations',
  nessie_get_atm: 'locations',
  nessie_list_branches: 'locations',
  nessie_get_branch: 'locations'
};

describe('chat card registry', () => {
  it('maps every one of the 30 tools to a non-unknown kind', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(30);
    for (const [tool, kind] of Object.entries(EXPECTED)) {
      expect(chatCardKind(tool)).toBe(kind);
      expect(chatCardKind(tool)).not.toBe('unknown');
    }
  });

  it('falls back to unknown for unregistered tools', () => {
    expect(chatCardKind('nessie_write_money')).toBe('unknown');
    expect(chatCardKind('')).toBe('unknown');
  });

  it('exposes product-language labels for every kind', () => {
    for (const kind of [...CHAT_CARD_KINDS, 'unknown' as const]) {
      expect(cardLabel(kind).length).toBeGreaterThan(0);
    }
    expect(cardLabel('anomalies')).toBe('Worth a look');
    expect(cardLabel('recurring')).toBe('Recurring payments');
    expect(cardLabel('locations')).toBe('Nearby');
    expect(cardLabel('customer')).toBe('Account holder');
  });
});

describe('asItems', () => {
  it('reads items, results, bills and accounts lists', () => {
    expect(asItems({ items: [{ a: 1 }, { b: 2 }] })).toHaveLength(2);
    expect(asItems({ results: [{ a: 1 }] })).toHaveLength(1);
    expect(asItems({ bills: [{ id: 'b' }, { id: 'c' }] })).toHaveLength(2);
    expect(asItems({ accounts: [{ id: 'x' }] })).toHaveLength(1);
  });

  it('wraps a single object', () => {
    const rows = asItems({ _id: 'acct-1', type: 'Checking' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: 'acct-1' });
  });

  it('handles arrays, null and wrapper-only payloads', () => {
    expect(asItems([{ id: 1 }, { id: 2 }])).toHaveLength(2);
    expect(asItems(null)).toEqual([]);
    expect(asItems(undefined)).toEqual([]);
    expect(asItems('nope')).toEqual([]);
    expect(asItems({ count: 0, truncated: false, items: [] })).toEqual([]);
    expect(asItems({ count: 0, message: 'No ATMs found.' })).toEqual([]);
  });

  it('filters non-record entries out of a list', () => {
    expect(asItems({ items: [{ id: 1 }, null, 'x', 3] })).toHaveLength(1);
  });
});

describe('asRecord', () => {
  it('returns object payloads and an empty object otherwise', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord('text')).toEqual({});
  });
});

describe('transactionKind', () => {
  it('marks deposits positive and withdrawals, purchases and transfers negative', () => {
    expect(transactionKind('nessie_list_account_deposits')).toBe('deposit');
    expect(transactionKind('nessie_get_deposit')).toBe('deposit');
    expect(transactionKind('nessie_list_account_withdrawals')).toBe('withdrawal');
    expect(transactionKind('nessie_get_withdrawal')).toBe('withdrawal');
    expect(transactionKind('nessie_get_purchase')).toBe('withdrawal');
    expect(transactionKind('nessie_get_transfer')).toBe('withdrawal');
  });
});

describe('CARD_KINDS coverage', () => {
  it('covers every kind returned for the 30 tools', () => {
    const returned = new Set(Object.values(EXPECTED));
    for (const kind of returned) expect(CARD_KINDS).toContain(kind);
    expect(new Set(CHAT_CARD_KINDS)).toEqual(
      new Set([
        'overview',
        'accounts',
        'account',
        'transactions',
        'transaction',
        'bills',
        'loans',
        'recurring',
        'spending',
        'cashflow',
        'anomalies',
        'rewards',
        'locations',
        'goal',
        'customer',
        'merchants'
      ])
    );
  });
});
