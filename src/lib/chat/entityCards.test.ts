import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accountCard,
  accountCards,
  accountHref,
  anchorEntityCards,
  anchorTransactionCards,
  anomalyExplanation,
  completeAnomalyContext,
  anomalyTransactionCards,
  billCard,
  billHref,
  billListCard,
  cashflowCard,
  climateWiseCard,
  goalCard,
  loanCard,
  locationCard,
  merchantCard,
  mergeEntityCards,
  mergeTransactionListCards,
  normalizeMaskedAccountNumber,
  profileCard,
  recurringCard,
  rewardCard,
  spendingPieCard,
  spendingPiePeriod,
  topMerchantCard,
  transactionHref,
  transactionListCard,
  type AccountEntityCard,
  type BillEntityCard,
  type BillListEntityCard,
  type CashflowPointEntityCard,
  type ClimateWiseEntityCard,
  type EntityCard,
  type GoalEntityCard,
  type LoanEntityCard,
  type LocationEntityCard,
  type MerchantEntityCard,
  type ProfileEntityCard,
  type RecurringChargeEntityCard,
  type RewardEntityCard,
  type SpendingPieEntityCard,
  type TransactionEntityCard,
  type TransactionListEntityCard
} from './entityCards.js';
import { inlineBlocks } from './inline.js';

function payload(findings: unknown): { findings: unknown } {
  return { findings };
}

describe('anomalyTransactionCards', () => {
  it('maps duplicate and outlier findings to transaction cards', () => {
    const cards = anomalyTransactionCards(
      payload([
        {
          type: 'duplicate',
          description: 'NETFLIX',
          amount: 15.49,
          date: '2026-11-02',
          duplicateOf: '2026-11-01'
        },
        { type: 'outlier', description: 'APPLE STORE', amount: 1299, date: '2026-11-03' }
      ]),
      42,
      1
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      id: 1,
      entityId: 'duplicate|NETFLIX|2026-11-02|15.49',
      kind: 'transaction',
      afterText: 42,
      payload: {
        description: 'NETFLIX',
        amount: 15.49,
        date: '2026-11-02',
        flag: 'duplicate',
        duplicateOf: '2026-11-01'
      }
    });
    expect(cards[0]?.payload).not.toHaveProperty('reason');
    expect(cards[1]?.payload).toMatchObject({
      description: 'APPLE STORE',
      amount: 1299,
      date: '2026-11-03',
      flag: 'unusual'
    });
    expect(cards[1]?.payload).not.toHaveProperty('duplicateOf');
  });

  it('deep-links each finding to its own account when findings span accounts', () => {
    const cards = anomalyTransactionCards(
      payload([
        {
          type: 'duplicate',
          description: 'NETFLIX.COM',
          amount: 19,
          date: '2026-11-02',
          accountId: 'checking-id'
        },
        {
          type: 'outlier',
          description: 'APPLE STORE',
          amount: 1800,
          date: '2026-11-03',
          accountId: 'card-id'
        }
      ]),
      0,
      1,
      { accountId: 'context-id', customerId: 'cust-1' }
    );

    expect(cards.map((card) => card.payload.accountId)).toEqual(['checking-id', 'card-id']);
    expect(cards.map((card) => card.payload.customerId)).toEqual(['cust-1', 'cust-1']);
  });

  it('falls back to the context account when a finding has no accountId', () => {
    const cards = anomalyTransactionCards(
      payload([{ type: 'outlier', description: 'APPLE STORE', amount: 1800, date: '2026-11-03' }]),
      0,
      1,
      { accountId: 'context-id' }
    );

    expect(cards[0]?.payload.accountId).toBe('context-id');
  });

  it('maps every non-duplicate type to unusual', () => {    const cards = anomalyTransactionCards(
      payload([
        { type: 'outlier', description: 'A', amount: 1, date: '2026-01-01' },
        { type: 'mystery', description: 'B', amount: 2, date: '2026-01-02' },
        { type: 42, description: 'C', amount: 3, date: '2026-01-03' }
      ]),
      0,
      1,
      { cap: 3 }
    );

    expect(cards.map((card) => card.payload.flag)).toEqual(['unusual', 'unusual', 'unusual']);
  });

  it('shows every finding by default and honours an explicit custom cap', () => {
    const findings = Array.from({ length: 9 }, (_, index) => ({
      type: 'outlier',
      description: `CHARGE ${index}`,
      amount: index + 1,
      date: '2026-11-01'
    }));

    expect(anomalyTransactionCards(payload(findings), 0, 1)).toHaveLength(9);
    expect(anomalyTransactionCards(payload(findings), 0, 1, { cap: 1 })).toHaveLength(1);
    expect(anomalyTransactionCards(payload(findings), 0, 1, { cap: 0 })).toEqual([]);
  });

  it('renders one inline card per finding (regression: three findings)', () => {
    const findings = [
      {
        _id: 'txn-dup-1',
        type: 'duplicate',
        description: 'NETFLIX.COM',
        amount: 15.49,
        date: '2026-11-02',
        duplicateOf: '2026-11-01'
      },
      { _id: 'txn-outlier', type: 'outlier', description: 'APPLE STORE', amount: 1299, date: '2026-11-03' },
      {
        _id: 'txn-dup-2',
        type: 'duplicate',
        description: 'SPOTIFY',
        amount: 9.99,
        date: '2026-11-04',
        duplicateOf: '2026-11-03'
      }
    ];

    const cards = anomalyTransactionCards(payload(findings), 0, 1);
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.payload.description)).toEqual([
      'NETFLIX.COM',
      'APPLE STORE',
      'SPOTIFY'
    ]);
    expect(cards.map((card) => card.payload.flag)).toEqual([
      'duplicate',
      'unusual',
      'duplicate'
    ]);

    const merged = mergeEntityCards([], cards);
    expect(merged).toHaveLength(3);
    expect(merged.map((entry) => entry.entityId)).toEqual([
      'txn-dup-1',
      'txn-outlier',
      'txn-dup-2'
    ]);
  });

  it('deduplicates by _id and by the stable key', () => {
    const byId = anomalyTransactionCards(
      payload([
        { _id: 'txn-1', type: 'outlier', description: 'A', amount: 1, date: '2026-01-01' },
        { _id: 'txn-1', type: 'outlier', description: 'B', amount: 2, date: '2026-01-02' }
      ]),
      0,
      1
    );
    expect(byId).toHaveLength(1);
    expect(byId[0]?.entityId).toBe('txn-1');
    expect(byId[0]?.payload.transactionId).toBe('txn-1');

    const byKey = anomalyTransactionCards(
      payload([
        { type: 'outlier', description: 'A', amount: 1, date: '2026-01-01' },
        { type: 'outlier', description: 'A', amount: 1, date: '2026-01-01' }
      ]),
      0,
      1
    );
    expect(byKey).toHaveLength(1);
  });

  it('preserves order and assigns increasing ids from startId', () => {
    const cards = anomalyTransactionCards(
      payload([
        { type: 'outlier', description: 'FIRST', amount: 1, date: '2026-01-01' },
        { type: 'duplicate', description: 'SECOND', amount: 2, date: '2026-01-02' }
      ]),
      10,
      7
    );

    expect(cards.map((card) => card.payload.description)).toEqual(['FIRST', 'SECOND']);
    expect(cards.map((card) => card.id)).toEqual([7, 8]);
  });

  it('skips malformed entries and fills missing fields safely', () => {
    const cards = anomalyTransactionCards(
      payload([
        null,
        'nope',
        [],
        { type: 'outlier', description: '', amount: '12.00', date: 7 },
        { type: 'duplicate', duplicateOf: 123 }
      ]),
      5,
      1
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]?.payload).toMatchObject({
      description: 'Recent charge',
      amount: null,
      date: '',
      flag: 'unusual'
    });
    expect(cards[1]?.payload).toMatchObject({
      description: 'Recent charge',
      amount: null,
      date: '',
      flag: 'duplicate'
    });
    expect(cards[1]?.payload).not.toHaveProperty('duplicateOf');
  });

  it('never throws on null, undefined, or clearly wrong payloads', () => {
    expect(anomalyTransactionCards(null, 0, 1)).toEqual([]);
    expect(anomalyTransactionCards(undefined, 0, 1)).toEqual([]);
    expect(anomalyTransactionCards('findings', 0, 1)).toEqual([]);
    expect(anomalyTransactionCards({ findings: 'nope' }, 0, 1)).toEqual([]);
    expect(anomalyTransactionCards({ findings: null }, 0, 1)).toEqual([]);
    expect(anomalyTransactionCards([], 0, 1)).toEqual([]);
  });

  it('carries the finding _id as transactionId and attaches account context', () => {
    const cards = anomalyTransactionCards(
      payload([
        {
          _id: 'txn-apple',
          type: 'outlier',
          description: 'APPLE STORE',
          amount: 1299,
          date: '2026-11-03'
        },
        {
          _id: 'txn-netflix',
          type: 'duplicate',
          description: 'NETFLIX.COM',
          amount: 15.49,
          date: '2026-11-02',
          duplicateOf: '2026-11-01'
        }
      ]),
      0,
      1,
      { accountId: 'acct-1', customerId: 'cust-1' }
    );

    expect(cards.map((card) => card.payload.transactionId)).toEqual([
      'txn-apple',
      'txn-netflix'
    ]);
    expect(cards[0]?.payload.accountId).toBe('acct-1');
    expect(cards[0]?.payload.customerId).toBe('cust-1');
    expect(cards[1]?.payload.accountId).toBe('acct-1');
    expect(cards[1]?.payload.customerId).toBe('cust-1');
    // Raw finding internals never leak into the card payload.
    expect(cards[0]?.payload).not.toHaveProperty('reason');
    expect(cards[0]?.payload).not.toHaveProperty('median');
  });

  it('keeps cards without a transaction id and omits blank context', () => {
    const cards = anomalyTransactionCards(
      payload([{ type: 'outlier', description: 'NO ID', amount: 5, date: '2026-11-01' }]),
      0,
      1,
      { accountId: '', customerId: 'cust-1' }
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.payload.transactionId).toBe('');
    expect(cards[0]?.payload).not.toHaveProperty('accountId');
    expect(cards[0]?.payload.customerId).toBe('cust-1');
  });
});

describe('transactionHref', () => {
  it('builds the dashboard deep link with encoded ids', () => {
    expect(transactionHref('cust-1', 'acct-2', 'txn 3')).toBe(
      '/dashboard?customer=cust-1&account=acct-2&txn=txn%203'
    );
  });

  it('returns undefined when any id is missing or blank', () => {
    expect(transactionHref(undefined, 'acct-2', 'txn-3')).toBeUndefined();
    expect(transactionHref('cust-1', undefined, 'txn-3')).toBeUndefined();
    expect(transactionHref('cust-1', 'acct-2', undefined)).toBeUndefined();
    expect(transactionHref('', 'acct-2', 'txn-3')).toBeUndefined();
    expect(transactionHref('cust-1', '  ', 'txn-3')).toBeUndefined();
    expect(transactionHref('cust-1', 'acct-2', '')).toBeUndefined();
  });
});

function transactionCard(
  id: number,
  description: string,
  flag: 'duplicate' | 'unusual' = 'unusual',
  afterText?: number
): TransactionEntityCard {
  return {
    id,
    entityId: `txn-${id}`,
    kind: 'transaction',
    payload: { description, amount: 100 + id, date: '2026-11-02', flag, transactionId: `txn-${id}` },
    ...(afterText === undefined ? {} : { afterText })
  };
}

describe('anchorTransactionCards', () => {
  it('anchors each card after its merchant colon in text order', () => {
    const text =
      'You have a suspiciously large transaction at APPLE: and a duplicate transaction at Netflix:';
    const cards = [
      transactionCard(1, 'APPLE STORE'),
      transactionCard(2, 'NETFLIX.COM', 'duplicate')
    ];

    const anchored = anchorTransactionCards(text, cards);
    expect(anchored[0]?.afterText).toBe(text.indexOf(':') + 1);
    expect(anchored[1]?.afterText).toBe(text.lastIndexOf(':') + 1);

    const blocks = inlineBlocks(text, anchored);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'cards', 'text', 'cards']);
    expect(blocks[1]).toMatchObject({ type: 'cards', cards: [{ id: 1 }] });
    expect(blocks[3]).toMatchObject({ type: 'cards', cards: [{ id: 2 }] });
    expect((blocks[0] as { text: string }).text).toContain('APPLE');
    expect((blocks[2] as { text: string }).text).toContain('Netflix');
  });

  it('anchors before a conjunction and after a sentence-ending period', () => {
    const text = 'There is a large charge at APPLE and another duplicate at Netflix.';
    const cards = [
      transactionCard(1, 'APPLE STORE'),
      transactionCard(2, 'NETFLIX', 'duplicate')
    ];

    const anchored = anchorTransactionCards(text, cards);
    expect(anchored[0]?.afterText).toBe(text.indexOf('and'));
    expect(anchored[1]?.afterText).toBe(text.length);

    const blocks = inlineBlocks(text, anchored);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'cards', 'text', 'cards']);
  });

  it('matches the full description when present', () => {
    const text = 'A charge at APPLE STORE appears twice.';
    const [anchored] = anchorTransactionCards(text, [transactionCard(1, 'APPLE STORE')]);
    expect(anchored?.afterText).toBe(text.indexOf('appears'));
  });

  it('keeps the existing afterText when the merchant is not mentioned', () => {
    const anchored = anchorTransactionCards('Nothing to see here.', [
      transactionCard(1, 'APPLE STORE', 'unusual', 123)
    ]);
    expect(anchored[0]?.afterText).toBe(123);
  });

  it('uses distinct occurrences for cards with the same merchant', () => {
    const text = 'Netflix first, then Netflix.';
    const anchored = anchorTransactionCards(text, [
      transactionCard(1, 'NETFLIX'),
      transactionCard(2, 'NETFLIX', 'duplicate')
    ]);
    expect(anchored[0]?.afterText).toBe(text.indexOf('first'));
    expect(anchored[1]?.afterText).toBeGreaterThan(anchored[0]?.afterText ?? 0);
    expect(anchored[1]?.afterText).toBe(text.length);
  });

  it('never mutates its input or throws on malformed data', () => {
    const cards = [transactionCard(1, 'APPLE STORE')];
    const anchored = anchorTransactionCards('at APPLE STORE.', cards);
    expect(anchored).not.toBe(cards);
    expect(anchored[0]).not.toBe(cards[0]);
    expect(cards[0]?.afterText).toBeUndefined();

    expect(anchorTransactionCards(null as unknown as string, cards)).toHaveLength(1);
    expect(anchorTransactionCards('text', null as unknown as EntityCard[])).toEqual([]);
    expect(
      anchorTransactionCards('text', [null as unknown as EntityCard]).length
    ).toBe(0);
  });
});

describe('anomalyExplanation', () => {
  it('explains a large charge and a duplicate without amounts or dates', () => {
    const sentence = anomalyExplanation([
      transactionCard(1, 'NETFLIX.COM', 'duplicate'),
      transactionCard(2, 'APPLE STORE')
    ]);

    expect(sentence).toContain('APPLE STORE is an unusually large purchase compared with your recent purchases on this account.');
    expect(sentence).toContain('NETFLIX.COM is a possible duplicate because the same merchant charged the same amount again within three days.');
    expect(sentence).toContain('You can review these charges');
    expect(sentence).not.toContain('$');
    expect(sentence).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(sentence.toLowerCase()).not.toContain('outlier');
  });

  it('handles a single unusual or duplicate card', () => {
    expect(anomalyExplanation([transactionCard(1, 'APPLE STORE')])).toContain('compared with your recent purchases');
    expect(anomalyExplanation([transactionCard(1, 'NETFLIX.COM', 'duplicate')])).toContain('same merchant charged the same amount again');
  });

  it('fills missing reasons for every flagged charge, preserves useful prose, and is idempotent', () => {
    const cards = [transactionCard(1, 'APPLE STORE'), transactionCard(2, 'NETFLIX.COM', 'duplicate'), transactionCard(3, 'LOCAL BOOKSTORE', 'duplicate')];
    const text = completeAnomalyContext('These charges are worth reviewing: APPLE, Netflix and LOCAL BOOKSTORE.', cards);
    for (const name of ['APPLE STORE', 'NETFLIX.COM', 'LOCAL BOOKSTORE']) expect(text).toContain(name);
    expect(text.match(/same merchant charged the same amount again/g)).toHaveLength(2);
    expect(completeAnomalyContext(text, cards)).toBe(text);
    const explained = 'APPLE is much larger than your recent purchases on this account.';
    expect(completeAnomalyContext(explained, [cards[0]])).toBe(explained);
    expect(text).not.toMatch(/confirmed fraud|definitely fraud|median|MAD|threshold/i);
  });

  it('uses a merchant comparison only when the finding supplies that baseline', () => {
    const cards = anomalyTransactionCards({ findings: [{ type: 'outlier', description: 'CAFE', amount: 1800, reason: "much larger than this merchant's usual purchases" }] }, 0, 1);
    expect(anomalyExplanation(cards)).toContain('your usual purchases at this merchant');
    const ordinary = { ...transactionCard(8, 'ORDINARY'), payload: { ...transactionCard(8, 'ORDINARY').payload, flag: undefined } };
    expect(completeAnomalyContext('An ordinary purchase.', [ordinary])).toBe('An ordinary purchase.');
  });

  it('returns an empty string without transaction cards', () => {
    expect(anomalyExplanation([])).toBe('');
    expect(anomalyExplanation(null as unknown as EntityCard[])).toBe('');
  });
});

describe('transactionListCard', () => {
  it('parses rows, whitelists fields, caps rows, and reports more', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      _id: `txn-${index}`,
      description: `Merchant ${index}`,
      amount: index + 1,
      transactionDate: '2026-11-02',
      status: 'posted',
      type: 'purchase',
      medium: 'balance',
      extra: 'do not leak'
    }));

    const card = transactionListCard({ items }, 42, 9);
    expect(card).not.toBeNull();
    expect(card).toMatchObject({
      id: 9,
      entityId: 'transaction-list',
      kind: 'transaction-list',
      afterText: 42
    });
    expect(card?.payload.rows).toHaveLength(8);
    expect(card?.payload.more).toBe(2);
    expect(card?.payload.rows[0]).toEqual({
      id: 'txn-0',
      description: 'Merchant 0',
      amount: 1,
      date: '2026-11-02',
      status: 'posted'
    });
    expect(card?.payload.rows[0]).not.toHaveProperty('type');
    expect(card?.payload.rows[0]).not.toHaveProperty('medium');
  });

  it('accepts arrays and derives ids and safe fallbacks', () => {
    const card = transactionListCard(
      [
        { description: 'Coffee', amount: 4.5, date: '2026-11-01' },
        { description: '', amount: '12.00', transactionDate: 7 }
      ],
      0,
      1
    );

    expect(card?.payload.rows).toEqual([
      { id: 'Coffee|2026-11-01|4.5', description: 'Coffee', amount: 4.5, date: '2026-11-01' },
      { id: 'Transaction||null', description: 'Transaction', amount: null, date: '' }
    ]);
  });

  it('deduplicates rows by id', () => {
    const card = transactionListCard(
      { items: [{ _id: 'a', description: 'One' }, { _id: 'a', description: 'Two' }] },
      0,
      1
    );
    expect(card?.payload.rows).toHaveLength(1);
    expect(card?.payload.more).toBe(0);
  });

  it('honours a custom cap', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ _id: `t-${index}` }));
    const card = transactionListCard({ items }, 0, 1, { cap: 2 });
    expect(card?.payload.rows).toHaveLength(2);
    expect(card?.payload.more).toBe(3);
  });

  it('attaches account and customer context to every row', () => {
    const card = transactionListCard(
      {
        items: [
          { _id: 't-1', description: 'Coffee', amount: 4.5, transactionDate: '2026-11-01' },
          { _id: 't-2', description: 'Rent', amount: 1800, transactionDate: '2026-11-02' }
        ]
      },
      0,
      1,
      { accountId: 'acct-1', customerId: 'cust-1' }
    );

    expect(card?.payload.rows).toEqual([
      {
        id: 't-1',
        description: 'Coffee',
        amount: 4.5,
        date: '2026-11-01',
        accountId: 'acct-1',
        customerId: 'cust-1'
      },
      {
        id: 't-2',
        description: 'Rent',
        amount: 1800,
        date: '2026-11-02',
        accountId: 'acct-1',
        customerId: 'cust-1'
      }
    ]);
    expect(card?.payload.rows[0]).not.toHaveProperty('type');
  });

  it('preserves kg and per-item account/customer ids for ClimateWise rows', () => {
    const card = transactionListCard(
      {
        items: [
          {
            _id: 'tx-1',
            description: 'SHELL',
            amount: 62,
            date: '2026-10-01',
            kg: 120.2,
            accountId: 'acct-card',
            customerId: 'cust-1'
          },
          { _id: 'tx-2', description: 'WHOLE FOODS MKT', amount: 40, date: '2026-10-03', kg: 60.5 }
        ],
        count: 2
      },
      0,
      1,
      { accountId: 'acct-checking', customerId: 'cust-1' }
    );

    expect(card?.payload.rows[0]).toEqual({
      id: 'tx-1',
      description: 'SHELL',
      amount: 62,
      date: '2026-10-01',
      accountId: 'acct-card',
      customerId: 'cust-1',
      kg: 120.2
    });
    // A row without its own account falls back to the shared context.
    expect(card?.payload.rows[1]).toEqual({
      id: 'tx-2',
      description: 'WHOLE FOODS MKT',
      amount: 40,
      date: '2026-10-03',
      accountId: 'acct-checking',
      customerId: 'cust-1',
      kg: 60.5
    });
    // Deep links still work from the per-row ids.
    expect(transactionHref(card?.payload.rows[0].customerId, card?.payload.rows[0].accountId, 'tx-1')).toContain(
      'account=acct-card'
    );
  });

  it('ignores a non-finite kg on regular transaction rows', () => {
    const card = transactionListCard(
      { items: [{ _id: 't-1', description: 'Coffee', kg: Number.NaN }] },
      0,
      1
    );
    expect(card?.payload.rows[0]).not.toHaveProperty('kg');
  });

  it('uses the declared count for the more count', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ _id: `t-${index}` }));
    const card = transactionListCard({ count: 25, items }, 0, 1);
    expect(card?.payload.rows).toHaveLength(8);
    expect(card?.payload.more).toBe(17);
  });

  it('reports the hidden rows from a 41-row recent-activity feed', () => {
    const items = Array.from({ length: 41 }, (_, index) => ({ _id: `tx-${index}` }));
    const card = transactionListCard({ count: 41, items }, 0, 1);
    expect(card?.payload.rows).toHaveLength(8);
    expect(card?.payload.more).toBe(33);
  });

  it('never reports negative more when the count is below the rows', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ _id: `t-${index}` }));
    const card = transactionListCard({ count: 5, items }, 0, 1);
    expect(card?.payload.rows).toHaveLength(8);
    expect(card?.payload.more).toBe(2);
  });

  it('returns null for empty or malformed payloads', () => {
    expect(transactionListCard(null, 0, 1)).toBeNull();
    expect(transactionListCard(undefined, 0, 1)).toBeNull();
    expect(transactionListCard('items', 0, 1)).toBeNull();
    expect(transactionListCard({ items: [] }, 0, 1)).toBeNull();
    expect(transactionListCard({ count: 3 }, 0, 1)).toBeNull();
  });
});

describe('mergeTransactionListCards', () => {
  function card(
    items: unknown[],
    afterText: number,
    id: number
  ): TransactionListEntityCard {
    const built = transactionListCard({ items }, afterText, id);
    if (!built) throw new Error('expected a list card');
    return built;
  }

  it('merges deposits and withdrawals into one deduped list', () => {
    const deposits = card(
      [
        { _id: 'd-1', description: 'Payroll', amount: 100, transactionDate: '2026-11-01' },
        { _id: 'd-2', description: 'Refund', amount: 20, transactionDate: '2026-11-02' }
      ],
      100,
      4
    );
    const withdrawals = card(
      [
        { _id: 'w-1', description: 'Coffee', amount: 4.5, transactionDate: '2026-11-03' },
        { _id: 'd-2', description: 'Refund', amount: 20, transactionDate: '2026-11-02' }
      ],
      200,
      6
    );

    const merged = mergeTransactionListCards(deposits, withdrawals);
    expect(merged.id).toBe(4);
    expect(merged.entityId).toBe('transaction-list');
    expect(merged.payload.rows.map((row) => row.id)).toEqual(['d-1', 'd-2', 'w-1']);
    expect(merged.payload.more).toBe(0);
    expect(merged.afterText).toBe(100);
  });

  it('prefers a real anchor over end-of-text and caps the merged rows', () => {
    const existing = card([{ _id: 'a' }, { _id: 'b' }], Number.MAX_SAFE_INTEGER, 2);
    const incoming = card([{ _id: 'c' }, { _id: 'd' }], 50, 3);

    expect(mergeTransactionListCards(existing, incoming).afterText).toBe(50);
    expect(mergeTransactionListCards(incoming, existing).afterText).toBe(50);

    const capped = mergeTransactionListCards(existing, incoming, 2);
    expect(capped.payload.rows).toHaveLength(2);
    expect(capped.payload.more).toBe(2);
  });

  it('preserves declared hidden totals while merging', () => {
    const existing = transactionListCard(
      { count: 41, items: Array.from({ length: 41 }, (_, index) => ({ _id: `w-${index}` })) },
      0,
      1
    );
    const incoming = transactionListCard(
      { count: 6, items: Array.from({ length: 6 }, (_, index) => ({ _id: `d-${index}` })) },
      0,
      2
    );
    if (!existing || !incoming) throw new Error('expected list cards');

    const merged = mergeTransactionListCards(existing, incoming);
    expect(merged.payload.rows).toHaveLength(8);
    expect(merged.payload.more).toBe(39);
  });

  it('preserves each row id and account/customer context while merging', () => {
    const existing = transactionListCard(
      {
        items: [
          { _id: 'd-1', description: 'Payroll', amount: 100, transactionDate: '2026-11-01' },
          { _id: 'd-2', description: 'Refund', amount: 20, transactionDate: '2026-11-02' }
        ]
      },
      100,
      1,
      { accountId: 'checking-1', customerId: 'cust-1' }
    );
    const incoming = transactionListCard(
      {
        items: [
          { _id: 'w-1', description: 'Coffee', amount: 4.5, transactionDate: '2026-11-03' }
        ]
      },
      200,
      2,
      { accountId: 'checking-1', customerId: 'cust-1' }
    );
    if (!existing || !incoming) throw new Error('expected list cards');

    const merged = mergeTransactionListCards(existing, incoming);
    expect(merged.payload.rows.map((row) => row.id)).toEqual(['d-1', 'd-2', 'w-1']);
    expect(
      merged.payload.rows.every(
        (row) => row.accountId === 'checking-1' && row.customerId === 'cust-1'
      )
    ).toBe(true);
  });
});

describe('anchorTransactionCards with list cards', () => {
  it('leaves transaction-list cards unchanged', () => {
    const list = transactionListCard(
      {
        items: [{ _id: 'a', description: 'APPLE STORE', amount: 12, transactionDate: '2026-11-01' }]
      },
      77,
      3
    );
    expect(list).not.toBeNull();

    const anchored = anchorTransactionCards('A charge at APPLE STORE.', [list!]);
    expect(anchored[0]?.kind).toBe('transaction-list');
    expect(anchored[0]?.afterText).toBe(77);
    expect(anchored[0]).not.toBe(list);
  });
});

describe('mergeEntityCards', () => {
  function card(id: number, entityId: string): TransactionEntityCard {
    return {
      id,
      entityId,
      kind: 'transaction',
      payload: { description: entityId, amount: id, date: '', flag: 'unusual', transactionId: entityId }
    };
  }

  it('merges by entityId and preserves first occurrence order', () => {
    const merged = mergeEntityCards(
      [card(1, 'a'), card(2, 'b')],
      [card(3, 'a'), card(4, 'c'), card(5, 'd')]
    );

    expect(merged.map((entry) => entry.entityId)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.map((entry) => entry.id)).toEqual([1, 2, 4, 5]);
  });

  it('deduplicates within each input list', () => {
    const merged = mergeEntityCards([card(1, 'a'), card(2, 'a')], [card(3, 'b'), card(4, 'b')]);
    expect(merged.map((entry) => entry.entityId)).toEqual(['a', 'b']);
  });

  it('preserves transaction-list and pie cards alongside anomaly cards', () => {
    const list = transactionListCard(
      { items: [{ _id: 't-1', description: 'Coffee', amount: 4.5 }] },
      10,
      9
    );
    if (!list) throw new Error('expected a list card');
    const pie = spendingPieCard(
      { categories: [{ category: 'Groceries', total: 100 }] },
      0,
      20
    );
    if (!pie) throw new Error('expected a pie card');

    const existing = [list, pie, card(1, 'a'), card(2, 'b')];
    const incoming = [card(3, 'c'), card(4, 'a'), card(5, 'd')];

    const merged = mergeEntityCards(existing, incoming);
    expect(merged[0]).toBe(list);
    expect(merged[1]).toBe(pie);
    expect(merged.map((entry) => entry.kind)).toEqual([
      'transaction-list',
      'spending-pie',
      'transaction',
      'transaction',
      'transaction',
      'transaction'
    ]);
    expect(merged.slice(2).map((entry) => entry.entityId)).toEqual(['a', 'b', 'c', 'd']);

    const zeroCap = mergeEntityCards(existing, incoming, 0);
    expect(zeroCap).toEqual([list, pie]);
    expect(zeroCap[0]).toBe(list);
    expect(zeroCap[1]).toBe(pie);
  });

  it('respects a custom cap and never throws on malformed input', () => {
    expect(mergeEntityCards([card(1, 'a')], [card(2, 'b')], 1).map((e) => e.entityId)).toEqual([
      'a'
    ]);
    expect(mergeEntityCards(null as unknown as EntityCard[], null as unknown as EntityCard[])).toEqual(
      []
    );
    expect(
      mergeEntityCards(
        [null as unknown as EntityCard, card(1, 'a')],
        [{ id: 2 } as unknown as EntityCard]
      ).map((entry) => entry.entityId)
    ).toEqual(['a']);
  });
});

describe('spendingPieCard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function breakdown(month: string, total: number, categories: unknown[]): unknown {
    return { month, total, transactionCount: 10, categories };
  }

  function category(name: string, total: number, share = 0): unknown {
    return { category: name, total, share };
  }

  it('chooses the latest complete month and formats the period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));

    const card = spendingPieCard(
      {
        monthlyBreakdown: [
          breakdown('2026-09', 100, [category('housing', 100, 1)]),
          breakdown('2026-10', 240, [
            category('shopping', 180, 0.75),
            category('groceries', 60, 0.25)
          ]),
          // Current/partial month: ignored even though it has data.
          breakdown('2026-11', 50, [category('dining', 50, 1)])
        ]
      },
      42,
      7
    );

    expect(card).not.toBeNull();
    expect(card).toMatchObject({
      id: 7,
      entityId: 'spending-pie',
      kind: 'spending-pie',
      afterText: 42
    });
    expect(card?.payload.period).toBe('October 2026');
    expect(card?.payload.total).toBe(240);
    expect(card?.payload.slices).toEqual([
      { label: 'shopping', amount: 180, share: 0.75 },
      { label: 'groceries', amount: 60, share: 0.25 }
    ]);
    expect(card?.payload.slices[0]).not.toHaveProperty('category');
    expect(card?.payload.slices[0]).not.toHaveProperty('total');
  });

  it('falls back to the latest positive breakdown when no month is complete', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T00:00:00Z'));

    const card = spendingPieCard(
      {
        monthlyBreakdown: [
          breakdown('2026-02', 80, [category('travel', 80, 1)]),
          breakdown('2026-03', 120, [category('dining', 120, 1)])
        ]
      },
      0,
      1
    );

    expect(card?.payload.period).toBe('March 2026');
    expect(card?.payload.slices.map((slice) => slice.label)).toEqual(['dining']);
  });

  it('falls back to top-level categories and totalSpend', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'));

    const card = spendingPieCard(
      {
        categories: [category('shopping', 300, 0.6), category('groceries', 200, 0.4)],
        totalSpend: 500
      },
      5,
      2
    );

    expect(card?.payload).toMatchObject({ period: 'Last 3 months', total: 500 });
    expect(card?.payload.slices).toEqual([
      { label: 'shopping', amount: 300, share: 0.6 },
      { label: 'groceries', amount: 200, share: 0.4 }
    ]);
    expect(card?.afterText).toBe(5);
  });

  it('keeps the top five categories and aggregates the rest into Other', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'));

    const card = spendingPieCard(
      {
        monthlyBreakdown: [
          breakdown('2026-10', 490, [
            category('one', 100),
            category('two', 90),
            category('three', 80),
            category('four', 70),
            category('five', 60),
            category('six', 50),
            category('seven', 40)
          ])
        ]
      },
      0,
      1
    );

    expect(card?.payload.slices.map((slice) => slice.label)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'Other'
    ]);
    expect(card?.payload.slices[5]).toMatchObject({ label: 'Other', amount: 90 });
    expect(card?.payload.slices[5]?.share).toBeCloseTo(90 / 490, 10);
    expect(card?.payload.slices.reduce((sum, slice) => sum + slice.amount, 0)).toBe(490);
  });

  it('computes shares from amounts and normalizes them to one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'));

    const card = spendingPieCard(
      {
        monthlyBreakdown: [
          breakdown('2026-10', 200, [
            // Rounded incoming shares disagree with the amounts and must be ignored.
            category('a', 50, 0.9),
            category('b', 30, 0.05),
            category('c', 20, 0.05)
          ])
        ]
      },
      0,
      1
    );

    expect(card?.payload.slices.map((slice) => slice.share)).toEqual([0.5, 0.3, 0.2]);
    const sum = card?.payload.slices.reduce((total, slice) => total + slice.share, 0) ?? 0;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('drops non-positive categories and returns null when nothing remains', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'));

    const card = spendingPieCard(
      {
        monthlyBreakdown: [
          breakdown('2026-10', 100, [
            category('rent', 100),
            category('refund', -20),
            category('empty', 0)
          ])
        ]
      },
      0,
      1
    );
    expect(card?.payload.slices).toEqual([{ label: 'rent', amount: 100, share: 1 }]);

    expect(
      spendingPieCard(
        { monthlyBreakdown: [breakdown('2026-10', 0, [category('rent', 0)])] },
        0,
        1
      )
    ).toBeNull();
    expect(spendingPieCard({ categories: [category('refund', -5)], totalSpend: 0 }, 0, 1)).toBeNull();
  });

  it('never throws and returns null for malformed or empty payloads', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'));

    expect(spendingPieCard(null, 0, 1)).toBeNull();
    expect(spendingPieCard(undefined, 0, 1)).toBeNull();
    expect(spendingPieCard('spending', 0, 1)).toBeNull();
    expect(spendingPieCard([], 0, 1)).toBeNull();
    expect(spendingPieCard({ monthlyBreakdown: 'nope' }, 0, 1)).toBeNull();
    expect(spendingPieCard({ monthlyBreakdown: [null, 7, 'x'] }, 0, 1)).toBeNull();
    expect(spendingPieCard({ categories: [] }, 0, 1)).toBeNull();
    expect(spendingPieCard({}, 0, 1)).toBeNull();
  });

  it('formats month keys and tolerates malformed ones', () => {
    expect(spendingPiePeriod('2026-01')).toBe('January 2026');
    expect(spendingPiePeriod('2026-10')).toBe('October 2026');
    expect(spendingPiePeriod('not-a-month')).toBe('not-a-month');
  });

  it('is left unchanged by transaction anchoring and merging', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'));

    const pie = spendingPieCard(
      {
        monthlyBreakdown: [
          breakdown('2026-10', 250, [category('shopping', 250)])
        ]
      },
      77,
      4
    );
    if (!pie) throw new Error('expected a pie card');

    const anchored = anchorTransactionCards('You spent at APPLE STORE.', [pie]);
    expect(anchored[0]?.kind).toBe('spending-pie');
    expect(anchored[0]?.afterText).toBe(77);
    expect(anchored[0]).not.toBe(pie);

    const merged = mergeEntityCards([pie], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(pie);
    expect((merged[0] as SpendingPieEntityCard).payload.period).toBe('October 2026');

    const mixed = mergeEntityCards([pie], [transactionCard(1, 'a')]);
    expect(mixed[0]).toBe(pie);
    expect(mixed.map((entry) => entry.kind)).toEqual(['spending-pie', 'transaction']);
  });
});

describe('billCard', () => {
  const bill = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    billId: 'bill-1',
    payee: 'City Power',
    nickname: 'Home utilities',
    amount: 120,
    dueDate: '2026-11-20',
    daysUntil: 6,
    status: 'pending',
    accountId: 'acct-checking',
    ...overrides
  });

  it('selects the largest bill and whitelists its fields', () => {
    const card = billCard(
      {
        asOf: '2026-11-14',
        days: 30,
        count: 2,
        total: 3120,
        coverageRatio: 1.4,
        shortfall: 0,
        bills: [bill(), bill({ billId: 'bill-2', payee: 'Rent', amount: 3000 })]
      },
      42,
      7,
      { customerId: 'cust-1' }
    );

    expect(card).not.toBeNull();
    expect(card).toMatchObject({
      id: 7,
      entityId: 'bill-2',
      kind: 'bill',
      afterText: 42,
      payload: {
        billId: 'bill-2',
        payee: 'Rent',
        amount: 3000,
        dueDate: '2026-11-20',
        status: 'pending',
        accountId: 'acct-checking',
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card!.payload).sort()).toEqual([
      'accountId',
      'amount',
      'billId',
      'customerId',
      'dueDate',
      'payee',
      'status'
    ]);
    expect(card!.payload).not.toHaveProperty('total');
    expect(card!.payload).not.toHaveProperty('coverageRatio');
    expect(card!.payload).not.toHaveProperty('shortfall');
    expect(card!.payload).not.toHaveProperty('nickname');
    expect(card!.payload).not.toHaveProperty('daysUntil');
  });

  it('breaks amount ties with the earliest due date', () => {
    const card = billCard(
      {
        bills: [
          bill({ billId: 'late', payee: 'Late', amount: 200, dueDate: '2026-12-02' }),
          bill({ billId: 'early', payee: 'Early', amount: 200, dueDate: '2026-11-18' })
        ]
      },
      0,
      1
    );
    expect((card as BillEntityCard).payload.billId).toBe('early');
  });

  it('normalizes a missing amount to null and keeps zero amounts', () => {
    const missing = billCard({ bills: [bill({ amount: undefined })] }, 0, 1);
    expect(missing?.payload.amount).toBeNull();

    const zero = billCard({ bills: [bill({ amount: 0 })] }, 0, 1);
    expect(zero?.payload.amount).toBe(0);
    expect(zero?.payload).not.toHaveProperty('customerId');
  });

  it('skips empty payees, negative amounts, missing due dates, and malformed rows', () => {
    const card = billCard(
      {
        bills: [
          null,
          'nope',
          bill({ payee: '   ', amount: 500, dueDate: '2026-11-18' }),
          bill({ payee: 'Refund', amount: -5, dueDate: '2026-11-18' }),
          bill({ payee: 'No date', amount: 400, dueDate: '' }),
          bill({ payee: 'No amount', amount: undefined, dueDate: '2026-12-01', billId: '' })
        ]
      },
      0,
      1
    );

    expect(card?.payload.payee).toBe('No amount');
    expect(card?.payload.amount).toBeNull();
    expect(card?.entityId).toBe('bill|No amount|2026-12-01|null');
  });

  it('returns null for empty or malformed payloads and never throws', () => {
    expect(billCard(null, 0, 1)).toBeNull();
    expect(billCard(undefined, 0, 1)).toBeNull();
    expect(billCard('bills', 0, 1)).toBeNull();
    expect(billCard({}, 0, 1)).toBeNull();
    expect(billCard({ bills: [] }, 0, 1)).toBeNull();
    expect(billCard({ bills: 'nope' }, 0, 1)).toBeNull();
    expect(billCard({ items: [bill()] }, 0, 1)).toBeNull();
  });
});

describe('billListCard', () => {
  const bill = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    billId: 'bill-1',
    payee: 'City Power',
    nickname: 'Home utilities',
    amount: 120,
    dueDate: '2026-11-18',
    daysUntil: 4,
    status: 'pending',
    accountId: 'acct-checking',
    ...overrides
  });

  it('keeps the tool order and whitelists each row', () => {
    const card = billListCard(
      {
        count: 2,
        total: 3120,
        coverageRatio: 1.4,
        shortfall: 0,
        bills: [
          bill(),
          bill({ billId: 'bill-2', payee: 'Maple Property', amount: 3000, dueDate: '2026-11-20' })
        ]
      },
      42,
      7,
      { customerId: 'cust-1' }
    );

    expect(card).not.toBeNull();
    const list = card as BillListEntityCard;
    expect(list).toMatchObject({
      id: 7,
      entityId: 'bill-list',
      kind: 'bill-list',
      afterText: 42,
      payload: { more: 0 }
    });
    expect(list.payload.rows.map((row) => row.id)).toEqual(['bill-1', 'bill-2']);
    expect(list.payload.rows.map((row) => row.payee)).toEqual(['City Power', 'Maple Property']);
    expect(list.payload.rows[0]).toMatchObject({
      payee: 'City Power',
      amount: 120,
      dueDate: '2026-11-18',
      status: 'pending',
      accountId: 'acct-checking',
      customerId: 'cust-1'
    });
    expect(Object.keys(list.payload.rows[0]).sort()).toEqual([
      'accountId',
      'amount',
      'customerId',
      'dueDate',
      'id',
      'payee',
      'status'
    ]);
    expect(list.payload).not.toHaveProperty('total');
    expect(list.payload).not.toHaveProperty('coverageRatio');
    expect(list.payload).not.toHaveProperty('shortfall');
  });

  it('shows every bill without truncating the list', () => {
    const bills = Array.from({ length: 11 }, (_, index) =>
      bill({ billId: `bill-${index + 1}`, payee: `Bill ${index + 1}` })
    );
    const card = billListCard({ bills }, 0, 1) as BillListEntityCard;
    expect(card.payload.rows).toHaveLength(11);
    expect(card.payload.rows[0].id).toBe('bill-1');
    expect(card.payload.rows[10].id).toBe('bill-11');
    expect(card.payload.more).toBe(0);
  });

  it('skips malformed entries and keeps valid rows in order', () => {
    const card = billListCard(
      {
        bills: [
          null,
          'nope',
          bill({ payee: '   ' }),
          bill({ payee: 'Refund', amount: -5 }),
          bill({ payee: 'No date', dueDate: '' }),
          bill({ payee: 'No id', billId: '' }),
          bill({ billId: 'bill-zero', payee: 'Zero', amount: 0 }),
          bill({ _id: 'bill-underscore', billId: undefined, payee: 'Underscore' })
        ]
      },
      0,
      1
    ) as BillListEntityCard;

    expect(card.payload.rows.map((row) => row.payee)).toEqual(['Zero', 'Underscore']);
    expect(card.payload.rows[0].amount).toBe(0);
    expect(card.payload.rows[0].id).toBe('bill-zero');
    expect(card.payload.rows[1].id).toBe('bill-underscore');
  });

  it('normalizes a missing amount to null and omits absent fields', () => {
    const card = billListCard(
      { bills: [bill({ amount: undefined, status: '  ', accountId: undefined })] },
      0,
      1
    ) as BillListEntityCard;
    expect(card.payload.rows[0].amount).toBeNull();
    expect(card.payload.rows[0]).not.toHaveProperty('status');
    expect(card.payload.rows[0]).not.toHaveProperty('accountId');
    expect(card.payload.rows[0]).not.toHaveProperty('customerId');
  });

  it('returns null for empty or malformed payloads and never throws', () => {
    expect(billListCard(null, 0, 1)).toBeNull();
    expect(billListCard(undefined, 0, 1)).toBeNull();
    expect(billListCard('bills', 0, 1)).toBeNull();
    expect(billListCard({}, 0, 1)).toBeNull();
    expect(billListCard({ bills: [] }, 0, 1)).toBeNull();
    expect(billListCard({ bills: 'nope' }, 0, 1)).toBeNull();
    expect(billListCard({ items: [bill()] }, 0, 1)).toBeNull();
    expect(billListCard({ bills: [null, 'nope'] }, 0, 1)).toBeNull();
  });
});

describe('accountCard', () => {
  const account = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: 'acct-checking',
    nickname: 'Everyday Checking',
    type: 'Checking',
    accountNumber: '\u2022\u2022\u2022\u2022 4212',
    balance: 4218,
    rewards: 0,
    customerId: 'cust-1',
    ...overrides
  });

  it('builds one card from a single account and masks the number', () => {
    const card = accountCard(account({ accountNumber: '12345678904212' }), 12, 4);

    expect(card).toMatchObject({
      id: 4,
      entityId: 'account:acct-checking',
      kind: 'account',
      afterText: 12,
      payload: {
        accountId: 'acct-checking',
        nickname: 'Everyday Checking',
        type: 'Checking',
        maskedNumber: '\u2022\u2022\u2022\u2022 4212',
        balance: 4218,
        rewards: 0,
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card!.payload).sort()).toEqual([
      'accountId',
      'balance',
      'customerId',
      'maskedNumber',
      'nickname',
      'rewards',
      'type'
    ]);
  });

  it('never renders an account list, whether empty or multi-row', () => {
    expect(accountCard({ items: [account(), account({ _id: 'acct-2' })] }, 0, 1)).toBeNull();
    expect(accountCard({ results: [] }, 0, 1)).toBeNull();
    expect(accountCard({ accounts: [account(), account()] }, 0, 1)).toBeNull();
  });

  it('requires an id and type and falls back to type as the nickname', () => {
    expect(accountCard({ nickname: 'No id', type: 'Checking' }, 0, 1)).toBeNull();
    expect(accountCard({ _id: 'acct-1', nickname: 'No type' }, 0, 1)).toBeNull();

    const card = accountCard({ _id: 'acct-1', type: 'savings' }, 0, 1);
    expect(card?.payload.nickname).toBe('savings');
    expect(card?.payload.balance).toBeNull();
    expect(card?.payload.rewards).toBeNull();
  });

  it('copies context customerId and accepts snake_case ids', () => {
    const card = accountCard(
      account({ customerId: undefined, customer_id: 'cust-row' }),
      0,
      1,
      { customerId: 'cust-context' }
    );
    expect(card?.payload.customerId).toBe('cust-row');

    const fallback = accountCard(
      { _id: 'acct-2', type: 'Checking' },
      0,
      1,
      { customerId: 'cust-context' }
    );
    expect(fallback?.payload.customerId).toBe('cust-context');
  });

  it('normalizes masked account numbers and returns null on malformed payloads', () => {
    expect(normalizeMaskedAccountNumber('1234567890123456')).toBe('\u2022\u2022\u2022\u2022 3456');
    expect(normalizeMaskedAccountNumber('****1234')).toBe('\u2022\u2022\u2022\u2022 1234');
    expect(normalizeMaskedAccountNumber('\u2022\u2022\u2022\u2022 1234')).toBe(
      '\u2022\u2022\u2022\u2022 1234'
    );
    expect(normalizeMaskedAccountNumber('')).toBe('');

    expect(accountCard(null, 0, 1)).toBeNull();
    expect(accountCard(undefined, 0, 1)).toBeNull();
    expect(accountCard('account', 0, 1)).toBeNull();
    expect(accountCard([], 0, 1)).toBeNull();
    expect(accountCard({ count: 3 }, 0, 1)).toBeNull();
  });
});

describe('accountCards', () => {
  const account = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: 'acct-checking',
    nickname: 'Everyday Checking',
    type: 'Checking',
    accountNumber: '\u2022\u2022\u2022\u2022 4212',
    balance: 4218,
    rewards: 0,
    customerId: 'cust-1',
    ...overrides
  });

  it('builds one card per valid account in payload order', () => {
    const cards = accountCards(
      {
        accounts: [
          account(),
          account({
            _id: 'acct-venture',
            nickname: 'Venture',
            type: 'Credit Card',
            accountNumber: '12345678907788',
            balance: 862,
            rewards: 24850
          })
        ]
      },
      12,
      4
    );

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.id)).toEqual([4, 5]);
    expect(cards.map((card) => card.entityId)).toEqual([
      'account:acct-checking',
      'account:acct-venture'
    ]);
    expect(cards.every((card) => card.kind === 'account')).toBe(true);
    expect(cards.every((card) => card.afterText === 12)).toBe(true);
    expect(cards[0].payload).toMatchObject({
      accountId: 'acct-checking',
      nickname: 'Everyday Checking',
      type: 'Checking',
      maskedNumber: '\u2022\u2022\u2022\u2022 4212',
      balance: 4218,
      rewards: 0,
      customerId: 'cust-1'
    });
    expect(cards[1].payload).toMatchObject({
      accountId: 'acct-venture',
      nickname: 'Venture',
      type: 'Credit Card',
      maskedNumber: '\u2022\u2022\u2022\u2022 7788',
      balance: 862,
      rewards: 24850
    });
  });

  it('skips malformed rows and preserves the order of valid ones', () => {
    const cards = accountCards(
      {
        items: [
          account({ _id: 'acct-first' }),
          { nickname: 'No id', type: 'Checking' },
          account({ _id: 'acct-second' }),
          { _id: 'acct-no-type' },
          'nope'
        ]
      },
      0,
      1
    );

    expect(cards.map((card) => card.entityId)).toEqual([
      'account:acct-first',
      'account:acct-second'
    ]);
    expect(cards.map((card) => card.id)).toEqual([1, 2]);
  });

  it('copies context customerId and returns an empty list without valid accounts', () => {
    const cards = accountCards(
      { accounts: [{ _id: 'acct-2', type: 'Checking' }] },
      0,
      1,
      { customerId: 'cust-context' }
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].payload.customerId).toBe('cust-context');

    expect(accountCards(null, 0, 1)).toEqual([]);
    expect(accountCards(undefined, 0, 1)).toEqual([]);
    expect(accountCards('accounts', 0, 1)).toEqual([]);
    expect(accountCards({ accounts: [] }, 0, 1)).toEqual([]);
    expect(accountCards({ count: 3 }, 0, 1)).toEqual([]);
  });
});

describe('accountHref', () => {
  it('builds the dashboard account link with encoded ids', () => {
    expect(accountHref('cust-1', 'acct 2')).toBe(
      '/dashboard?customer=cust-1&account=acct%202'
    );
  });

  it('returns undefined when either id is missing', () => {
    expect(accountHref(undefined, 'acct-2')).toBeUndefined();
    expect(accountHref('cust-1', undefined)).toBeUndefined();
    expect(accountHref('', 'acct-2')).toBeUndefined();
    expect(accountHref('cust-1', '  ')).toBeUndefined();
  });
});

describe('billHref', () => {
  it('builds the dashboard bills deep link with encoded ids', () => {
    expect(billHref('cust-1', 'acct-2', 'bill 3')).toBe(
      '/dashboard?customer=cust-1&account=acct-2&tab=bills&bill=bill%203'
    );
  });

  it('returns undefined when any id is missing or blank', () => {
    expect(billHref(undefined, 'acct-2', 'bill-3')).toBeUndefined();
    expect(billHref('cust-1', undefined, 'bill-3')).toBeUndefined();
    expect(billHref('cust-1', 'acct-2', undefined)).toBeUndefined();
    expect(billHref('', 'acct-2', 'bill-3')).toBeUndefined();
    expect(billHref('cust-1', '  ', 'bill-3')).toBeUndefined();
    expect(billHref('cust-1', 'acct-2', '  ')).toBeUndefined();
  });
});

describe('loanCard', () => {
  const loan = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: 'loan-1',
    type: 'Auto',
    status: 'active',
    monthlyPayment: 412,
    amount: 18400,
    creditScore: 721,
    description: 'Auto loan',
    accountId: 'acct-credit',
    ...overrides
  });

  it('selects the largest loan and whitelists its fields', () => {
    const card = loanCard(
      {
        count: 2,
        truncated: false,
        items: [loan(), loan({ _id: 'loan-2', type: 'Home', amount: 220000 })],
        extra: 'do not leak'
      },
      42,
      5,
      { customerId: 'cust-1' }
    );

    expect(card).toMatchObject({
      id: 5,
      entityId: 'loan:loan-2',
      kind: 'loan',
      afterText: 42,
      payload: {
        loanId: 'loan-2',
        type: 'Home',
        balance: 220000,
        monthlyPayment: 412,
        status: 'active',
        accountId: 'acct-credit',
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card!.payload).sort()).toEqual([
      'accountId',
      'balance',
      'customerId',
      'loanId',
      'monthlyPayment',
      'status',
      'type'
    ]);
    expect(card!.payload).not.toHaveProperty('creditScore');
    expect(card!.payload).not.toHaveProperty('description');
  });

  it('breaks balance ties by type and falls back to description', () => {
    const tied = loanCard(
      {
        items: [
          loan({ _id: 'z', type: 'Personal', amount: 5000 }),
          loan({ _id: 'a', type: 'Auto', amount: 5000 })
        ]
      },
      0,
      1
    );
    expect((tied as LoanEntityCard).payload.loanId).toBe('a');

    const description = loanCard(
      { items: [{ _id: 'loan-3', description: 'Student', amount: 900 }] },
      0,
      1
    );
    expect(description?.payload.type).toBe('Student');
    expect(description?.payload.monthlyPayment).toBeNull();
  });

  it('skips rows without an id or type/description, and empty payloads', () => {
    const card = loanCard(
      {
        items: [
          null,
          'nope',
          loan({ _id: '', type: 'No id' }),
          loan({ _id: 'loan-4', type: '', description: '' })
        ]
      },
      0,
      1
    );
    expect(card).toBeNull();

    expect(loanCard(null, 0, 1)).toBeNull();
    expect(loanCard(undefined, 0, 1)).toBeNull();
    expect(loanCard('loans', 0, 1)).toBeNull();
    expect(loanCard({ items: [] }, 0, 1)).toBeNull();
    expect(loanCard({ count: 0, message: 'No loans' }, 0, 1)).toBeNull();
  });
});

describe('locationCard', () => {
  it('builds one branch card with a composed address and hours', () => {
    const card = locationCard(
      {
        count: 2,
        results: [
          {
            _id: 'branch-1',
            name: 'Clarendon Branch',
            address: {
              street: '2900 N Glebe Rd',
              city: 'Arlington',
              state: 'VA',
              zip: '22207'
            },
            hours: ['MON-FRI 9:00-17:00', 'SAT 9:00-13:00'],
            lat: 38.9,
            lng: -77.1
          },
          { _id: 'branch-2', name: 'Second', address: {} }
        ]
      },
      12,
      3,
      { customerId: 'cust-1' }
    );

    expect(card).toMatchObject({
      id: 3,
      entityId: 'location:branch-1',
      kind: 'location',
      afterText: 12,
      payload: {
        locationId: 'branch-1',
        name: 'Clarendon Branch',
        address: '2900 N Glebe Rd, Arlington, VA 22207',
        hours: 'MON-FRI 9:00-17:00, SAT 9:00-13:00',
        type: 'branch',
        lat: 38.9,
        lng: -77.1,
        customerId: 'cust-1'
      }
    });
    expect(card?.payload.type).toBe('branch');
    expect(card?.payload.address).toContain('2900 N Glebe Rd');
  });

  it('keeps an ATM address empty rather than inventing one', () => {
    const card = locationCard(
      {
        count: 1,
        results: [
          {
            _id: 'atm-1',
            name: 'Arlington ATM',
            hours: '24 HOURS',
            lat: 38.88,
            lng: -77.1,
            distanceMiles: 1.4
          }
        ]
      },
      0,
      1,
      { type: 'atm' }
    );
    expect(card?.payload.address).toBe('');
    expect(card?.payload.hours).toBe('24 HOURS');
    expect(card?.payload.type).toBe('atm');
    expect(card?.payload.lat).toBe(38.88);
    expect(card?.payload.lng).toBe(-77.1);
    expect(card?.payload.distanceMiles).toBe(1.4);
    expect(card?.entityId).toBe('location:atm-1');
  });

  it('infers the ATM type from coordinates when no address is present', () => {
    const card = locationCard(
      { results: [{ _id: 'atm-2', name: 'No Address ATM', lat: 38.9, lng: -77.2 }] },
      0,
      1
    );
    expect(card?.payload.type).toBe('atm');
    expect(card?.payload.lat).toBe(38.9);
    expect(card?.payload.lng).toBe(-77.2);
  });

  it('omits malformed coordinates while keeping the card', () => {
    const card = locationCard(
      {
        results: [
          {
            _id: 'atm-3',
            name: 'Malformed Coords ATM',
            lat: 'not-a-number',
            lng: 500
          }
        ]
      },
      4,
      2,
      { type: 'atm' }
    );
    expect(card).toMatchObject({
      id: 2,
      afterText: 4,
      kind: 'location',
      payload: { locationId: 'atm-3', name: 'Malformed Coords ATM', type: 'atm' }
    });
    expect(card?.payload).not.toHaveProperty('lat');
    expect(card?.payload).not.toHaveProperty('lng');
  });

  it('skips rows without an id or name and malformed payloads', () => {
    expect(
      locationCard(
        {
          results: [
            null,
            { _id: '', name: 'No id' },
            { _id: 'x', name: '   ' },
            { _id: 'atm-2', name: 'Kept', address: {} }
          ]
        },
        0,
        1
      )?.payload.locationId
    ).toBe('atm-2');

    expect(locationCard(null, 0, 1)).toBeNull();
    expect(locationCard('locations', 0, 1)).toBeNull();
    expect(locationCard({ count: 0, message: 'none' }, 0, 1)).toBeNull();
    expect(locationCard([], 0, 1)).toBeNull();
  });
});

describe('recurringCard', () => {
  it('selects the largest average amount and whitelists its fields', () => {
    const card = recurringCard(
      {
        count: 2,
        recurringCharges: [
          {
            description: 'NETFLIX',
            monthsSeen: 3,
            occurrences: 3,
            averageAmount: 15.49,
            lastAmount: 15.49,
            lastDate: '2026-11-02'
          },
          {
            description: 'RENT',
            monthsSeen: 6,
            occurrences: 6,
            averageAmount: 1800,
            lastAmount: 1800,
            lastDate: '2026-11-01'
          }
        ]
      },
      20,
      8,
      { customerId: 'cust-1' }
    );

    expect(card).toMatchObject({
      id: 8,
      entityId: 'RENT|1800',
      kind: 'recurring',
      afterText: 20,
      payload: {
        chargeId: 'RENT|1800',
        description: 'RENT',
        averageAmount: 1800,
        monthsSeen: 6,
        lastDate: '2026-11-01',
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card!.payload).sort()).toEqual([
      'averageAmount',
      'chargeId',
      'customerId',
      'description',
      'lastDate',
      'monthsSeen'
    ]);
    expect(card!.payload).not.toHaveProperty('occurrences');
    expect(card!.payload).not.toHaveProperty('lastAmount');
  });

  it('skips rows without a description and normalizes missing values', () => {
    const card = recurringCard(
      {
        recurringCharges: [
          null,
          { description: '   ', averageAmount: 99, monthsSeen: 2 },
          { description: 'GYM', averageAmount: undefined, monthsSeen: undefined, lastDate: '' }
        ]
      },
      0,
      1
    );
    expect(card?.payload).toMatchObject({
      chargeId: 'GYM|null',
      description: 'GYM',
      averageAmount: null,
      monthsSeen: 0,
      lastDate: ''
    });

    expect(recurringCard(null, 0, 1)).toBeNull();
    expect(recurringCard('recurring', 0, 1)).toBeNull();
    expect(recurringCard({ recurringCharges: [] }, 0, 1)).toBeNull();
    expect(recurringCard({ recurringCharges: 'nope' }, 0, 1)).toBeNull();
  });
});

describe('rewardCard', () => {
  it('selects the credit account with the highest positive rewards', () => {
    const card = rewardCard(
      {
        accounts: [
          { _id: 'acct-checking', type: 'Checking', nickname: 'Everyday', rewards: 900 },
          { _id: 'acct-venture', type: 'Credit Card', nickname: 'Venture Rewards', rewards: 24850 },
          { _id: 'acct-quick', type: 'Credit Card', nickname: 'Quicksilver', rewards: 31200 }
        ],
        extra: 'do not leak'
      },
      42,
      7,
      { customerId: 'cust-1' }
    );

    expect(card).toMatchObject({
      id: 7,
      entityId: 'reward:acct-quick',
      kind: 'reward',
      afterText: 42,
      payload: {
        rewardId: 'acct-quick',
        label: 'Quicksilver',
        points: 31200,
        accountId: 'acct-quick',
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card!.payload).sort()).toEqual([
      'accountId',
      'customerId',
      'label',
      'points',
      'rewardId'
    ]);
    expect(card!.payload).not.toHaveProperty('balance');
    expect(card!.payload).not.toHaveProperty('type');
  });

  it('falls back to nickname missing and ignores zero or non-credit rewards', () => {
    const card = rewardCard(
      {
        accounts: [
          { _id: 'acct-zero', type: 'Credit Card', nickname: 'Zero', rewards: 0 },
          { _id: 'acct-check', type: 'Checking', nickname: 'Checking', rewards: 5000 },
          { _id: 'credit-1', type: 'credit card', rewards: 1200 }
        ]
      },
      0,
      1
    );
    expect(card?.payload).toMatchObject({
      rewardId: 'credit-1',
      label: 'credit card',
      points: 1200,
      accountId: 'credit-1'
    });
  });

  it('builds a total-rewards card when the payload has no account rows', () => {
    const card = rewardCard({ totalRewards: 24850, accounts: [] }, 10, 3, {
      customerId: 'cust-1'
    });

    expect(card).toMatchObject({
      id: 3,
      entityId: 'reward:total',
      kind: 'reward',
      afterText: 10,
      payload: {
        rewardId: 'total',
        label: 'Total rewards',
        points: 24850,
        customerId: 'cust-1'
      }
    });
    expect(card!.payload).not.toHaveProperty('accountId');
  });

  it('returns null when no reward is positive', () => {
    expect(rewardCard({ accounts: [{ type: 'Checking', rewards: 0 }] }, 0, 1)).toBeNull();
    expect(rewardCard({ totalRewards: 0 }, 0, 1)).toBeNull();
    expect(rewardCard({ totalRewards: -10 }, 0, 1)).toBeNull();
    expect(rewardCard(null, 0, 1)).toBeNull();
    expect(rewardCard(undefined, 0, 1)).toBeNull();
    expect(rewardCard('rewards', 0, 1)).toBeNull();
    expect(rewardCard({ count: 0, message: 'No accounts' }, 0, 1)).toBeNull();
  });
});

describe('goalCard', () => {
  const projection = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    asOf: '2026-11-14',
    accountId: 'acct-savings',
    currentBalance: 12640,
    targetAmount: 20000,
    monthlyNet: 1840,
    monthsInAverage: 3,
    monthsToTarget: 4,
    projections: [{ months: 3, projectedBalance: 18160 }],
    onTrack: true,
    ...overrides
  });

  it('builds one goal with a projected date and no advice fields', () => {
    const card = goalCard(projection(), 30, 4, { customerId: 'cust-1' });

    expect(card).toMatchObject({
      id: 4,
      entityId: 'goal:acct-savings:20000',
      kind: 'goal',
      afterText: 30,
      payload: {
        goalId: 'goal:acct-savings:20000',
        accountId: 'acct-savings',
        target: 20000,
        current: 12640,
        monthsToTarget: 4,
        projectedDate: '2027-03-14',
        customerId: 'cust-1'
      }
    });
    expect(Object.keys(card!.payload).sort()).toEqual([
      'accountId',
      'current',
      'customerId',
      'goalId',
      'monthsToTarget',
      'projectedDate',
      'target'
    ]);
    expect(card!.payload).not.toHaveProperty('onTrack');
    expect(card!.payload).not.toHaveProperty('monthlyNet');
    expect(card!.payload).not.toHaveProperty('projections');
  });

  it('omits the projected date when monthsToTarget is null or negative', () => {
    const noMonths = goalCard(projection({ monthsToTarget: null }), 0, 1);
    expect(noMonths?.payload.monthsToTarget).toBeNull();
    expect(noMonths?.payload).not.toHaveProperty('projectedDate');

    const negative = goalCard(projection({ monthsToTarget: -2 }), 0, 1);
    expect(negative?.payload.monthsToTarget).toBeNull();
    expect(negative?.payload).not.toHaveProperty('projectedDate');
  });

  it('projects from a zero-month target and tolerates a missing account id', () => {
    const card = goalCard(
      projection({ monthsToTarget: 0, currentBalance: 21000, accountId: undefined }),
      0,
      1
    );
    expect(card?.entityId).toBe('goal:account:20000');
    expect(card?.payload.monthsToTarget).toBe(0);
    expect(card?.payload.projectedDate).toBe('2026-11-14');
    expect(card?.payload.accountId).toBeUndefined();
  });

  it('rejects invalid targets, balances, and malformed payloads', () => {
    expect(goalCard(projection({ targetAmount: 0 }), 0, 1)).toBeNull();
    expect(goalCard(projection({ targetAmount: -1 }), 0, 1)).toBeNull();
    expect(goalCard(projection({ currentBalance: -1 }), 0, 1)).toBeNull();
    expect(goalCard(projection({ currentBalance: undefined }), 0, 1)).toBeNull();
    expect(goalCard(projection({ asOf: 'not-a-date' }), 0, 1)?.payload).not.toHaveProperty(
      'projectedDate'
    );
    expect(goalCard(null, 0, 1)).toBeNull();
    expect(goalCard('goal', 0, 1)).toBeNull();
  });
});

describe('cashflowCard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chooses the latest complete month and formats the period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));

    const card = cashflowCard(
      {
        monthlyCashflow: [
          { month: '2026-09', inflow: 5200, outflow: 4100, net: 1100 },
          { month: '2026-10', inflow: 6100, outflow: 4800, net: 1300 },
          { month: '2026-11', inflow: 900, outflow: 300, net: 600 }
        ]
      },
      25,
      9
    );

    expect(card).toMatchObject({
      id: 9,
      entityId: 'cashflow:2026-10',
      kind: 'cashflow',
      afterText: 25,
      payload: {
        period: 'October 2026',
        inflow: 6100,
        outflow: 4800,
        net: 1300
      }
    });
  });

  it('computes net from inflow and outflow when net is missing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));

    const card = cashflowCard(
      {
        monthlyCashflow: [
          { month: '2026-09', inflow: 1000, outflow: 1500 },
          { month: '2026-10', inflow: 2000, outflow: 1200, net: 'nope' }
        ]
      },
      0,
      1
    );
    expect(card?.payload.net).toBe(800);
  });

  it('falls back to the last entry when no month is complete', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));

    const card = cashflowCard(
      {
        monthlyCashflow: [
          { month: '2026-11', inflow: 900, outflow: 300, net: 600 },
          { month: '2026-12', inflow: 700, outflow: 100, net: 600 }
        ]
      },
      0,
      1
    );
    expect(card?.entityId).toBe('cashflow:2026-12');
    expect(card?.payload.period).toBe('December 2026');
  });

  it('skips malformed rows and returns null when nothing is valid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));

    const card = cashflowCard(
      {
        monthlyCashflow: [
          null,
          'nope',
          { month: 'September 2026', inflow: 1, outflow: 1 },
          { month: '2026-10', inflow: 'x', outflow: 1 },
          { month: '2026-09', inflow: 10, outflow: 4 }
        ]
      },
      0,
      1
    );
    expect(card?.entityId).toBe('cashflow:2026-09');

    expect(cashflowCard({ monthlyCashflow: [] }, 0, 1)).toBeNull();
    expect(cashflowCard({ monthlyCashflow: 'nope' }, 0, 1)).toBeNull();
    expect(cashflowCard(null, 0, 1)).toBeNull();
  });
});

describe('merchantCard', () => {
  it('builds one merchant with a composed address and context customer id', () => {
    const card = merchantCard(
      {
        _id: 'merchant-1',
        name: 'Whole Foods Market',
        category: 'groceries',
        address: { street: '123 Main St', city: 'Arlington', state: 'VA', zip: '22201' }
      },
      42,
      7,
      { customerId: 'cust-maya' }
    );

    expect(card).toEqual({
      id: 7,
      entityId: 'merchant:merchant-1',
      kind: 'merchant',
      afterText: 42,
      payload: {
        merchantId: 'merchant-1',
        name: 'Whole Foods Market',
        category: 'groceries',
        address: '123 Main St, Arlington, VA',
        customerId: 'cust-maya'
      }
    });
  });

  it('selects the first valid merchant from a list and skips malformed rows', () => {
    const card = merchantCard(
      {
        items: [
          null,
          { name: 'No Id' },
          { _id: 'm-2' },
          {
            _id: 'm-3',
            name: 'Blue Bottle Coffee',
            address: { street: '1 Market St', city: 'San Francisco', state: 'CA' }
          },
          { _id: 'm-4', name: 'Later Merchant' }
        ]
      },
      0,
      3
    );

    expect(card?.payload.merchantId).toBe('m-3');
    expect(card?.payload.name).toBe('Blue Bottle Coffee');
    expect(card?.payload.address).toBe('1 Market St, San Francisco, CA');
    expect(card?.payload.category).toBeUndefined();
    expect(card).not.toHaveProperty('payload.customerId');
  });

  it('omits missing category and address and accepts a single merchant record', () => {
    const card = merchantCard({ _id: 'm-1', name: 'Netflix' }, 0, 1);
    expect(card?.payload).toEqual({ merchantId: 'm-1', name: 'Netflix' });
    expect(card?.payload).not.toHaveProperty('category');
    expect(card?.payload).not.toHaveProperty('address');
  });

  it('returns null for malformed or empty merchant payloads', () => {
    expect(merchantCard(null, 0, 1)).toBeNull();
    expect(merchantCard([], 0, 1)).toBeNull();
    expect(merchantCard({ count: 0, message: 'none' }, 0, 1)).toBeNull();
    expect(merchantCard({ _id: 'm-1' }, 0, 1)).toBeNull();
    expect(merchantCard({ name: 'No Id' }, 0, 1)).toBeNull();
    expect(merchantCard('nope', 0, 1)).toBeNull();
  });
});

describe('topMerchantCard', () => {
  it('builds one merchant card from the top merchant row', () => {
    const card = topMerchantCard(
      {
        count: 12,
        months: 3,
        items: [
          {
            _id: 'merchant:whole-foods-market',
            name: 'Whole Foods Market',
            category: 'groceries',
            transactionCount: 9,
            total: 540
          },
          { _id: 'merchant:trader-joes', name: "Trader Joe's", category: 'groceries' }
        ]
      },
      21,
      4,
      { customerId: 'cust-maya' }
    );

    expect(card).toEqual({
      id: 4,
      entityId: 'merchant:merchant:whole-foods-market',
      kind: 'merchant',
      afterText: 21,
      payload: {
        merchantId: 'merchant:whole-foods-market',
        name: 'Whole Foods Market',
        category: 'groceries',
        customerId: 'cust-maya'
      }
    });
  });

  it('falls back to a stable id and returns null without a top row', () => {
    expect(
      topMerchantCard({ items: [{ name: 'Corner Cafe', category: 'dining' }] }, 0, 1)?.payload
    ).toEqual({
      merchantId: 'top-merchant:Corner Cafe',
      name: 'Corner Cafe',
      category: 'dining'
    });
    expect(topMerchantCard({ items: [] }, 0, 1)).toBeNull();
    expect(topMerchantCard({ count: 0 }, 0, 1)).toBeNull();
    expect(topMerchantCard(null, 0, 1)).toBeNull();
  });
});

describe('profileCard', () => {
  it('builds one profile with name and city/state only', () => {
    const card = profileCard(
      {
        _id: 'cust-maya',
        firstName: 'Maya',
        lastName: 'Chen',
        email: 'maya@example.com',
        phone: '555-0100',
        address: {
          street: '123 Main St',
          city: 'Arlington',
          state: 'VA',
          zip: '22201'
        }
      },
      12,
      5
    );

    expect(card).toEqual({
      id: 5,
      entityId: 'profile:cust-maya',
      kind: 'profile',
      afterText: 12,
      payload: { customerId: 'cust-maya', name: 'Maya Chen', location: 'Arlington, VA' }
    });
    expect(card?.payload).not.toHaveProperty('street');
    expect(card?.payload).not.toHaveProperty('zip');
    expect(card?.payload).not.toHaveProperty('phone');
    expect(card?.payload).not.toHaveProperty('email');
  });

  it('accepts a single-customer list wrapper and omits a missing location', () => {
    const card = profileCard(
      { items: [{ _id: 'cust-1', firstName: 'Ada', lastName: 'Lovelace' }] },
      0,
      1
    );
    expect(card?.payload).toEqual({ customerId: 'cust-1', name: 'Ada Lovelace' });
    expect(card?.payload).not.toHaveProperty('location');
  });

  it('returns null for a customer list with more than one row', () => {
    expect(
      profileCard(
        {
          items: [
            { _id: 'cust-1', firstName: 'Maya', lastName: 'Chen' },
            { _id: 'cust-2', firstName: 'Ada', lastName: 'Lovelace' }
          ]
        },
        0,
        1
      )
    ).toBeNull();
  });

  it('skips missing ids/names and malformed payloads', () => {
    expect(profileCard({ firstName: 'Maya', lastName: 'Chen' }, 0, 1)).toBeNull();
    expect(profileCard({ _id: 'cust-1' }, 0, 1)).toBeNull();
    expect(profileCard({ _id: 'cust-1', firstName: ' ', lastName: '' }, 0, 1)).toBeNull();
    expect(profileCard(null, 0, 1)).toBeNull();
    expect(profileCard([], 0, 1)).toBeNull();
    expect(profileCard({ count: 1 }, 0, 1)).toBeNull();
  });
});

describe('anchorEntityCards', () => {
  function bill(id: number, payee: string, afterText?: number): BillEntityCard {
    return {
      id,
      entityId: `bill-${id}`,
      kind: 'bill',
      payload: { billId: `bill-${id}`, payee, amount: 100, dueDate: '2026-11-20' },
      ...(afterText === undefined ? {} : { afterText })
    };
  }

  function account(id: number, nickname: string, type: string, afterText?: number): AccountEntityCard {
    return {
      id,
      entityId: `account:${id}`,
      kind: 'account',
      payload: {
        accountId: `acct-${id}`,
        nickname,
        type,
        maskedNumber: '\u2022\u2022\u2022\u2022 1234',
        balance: 100,
        rewards: 0
      },
      ...(afterText === undefined ? {} : { afterText })
    };
  }

  it('anchors a bill after the complete explanation rather than splitting its sentence', () => {
    const text = 'The largest bill is City Power: it is due soon.';
    const [anchored] = anchorEntityCards(text, [bill(1, 'City Power')]);
    expect(anchored?.afterText).toBe(text.length);
  });

  it('keeps each bill at the end of its own context and buffers incomplete streamed paragraphs', () => {
    const first = 'City Power is next. Your checking balance covers this payment.';
    const second = 'Rent is later. You can check your lease before scheduling it.';
    const text = `${first}\n\n${second}\n\nYou can review both payments.`;
    const cards = [bill(1, 'City Power'), bill(2, 'Rent')];
    expect(anchorEntityCards(text, cards).map((card) => card.afterText)).toEqual([first.length, first.length + 2 + second.length]);
    expect(anchorEntityCards('City Power is', cards.slice(0, 1), { pending: true })[0].afterText).toBe(Number.MAX_SAFE_INTEGER);
    expect(anchorEntityCards(first + '\n\nNext', cards.slice(0, 1), { pending: true })[0].afterText).toBe(first.length);
    expect(anchorEntityCards('Your next bill is covered.', cards.slice(0, 1), { pending: true })[0].afterText).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('anchors an account after its nickname, falling back to type', () => {
    const byNickname = 'Your Everyday Checking account is your main one.';
    const [nicknameCard] = anchorEntityCards(byNickname, [
      account(1, 'Everyday Checking', 'Checking')
    ]);
    expect(nicknameCard?.afterText).toBe(byNickname.indexOf('account'));

    const byType = 'This savings account earns interest.';
    const [typeCard] = anchorEntityCards(byType, [account(1, 'Emergency Fund', 'savings')]);
    expect(typeCard?.afterText).toBe(byType.indexOf('account'));
  });

  it('anchors loans, locations, and recurring charges after their names', () => {
    const loan: LoanEntityCard = {
      id: 1,
      entityId: 'loan:loan-1',
      kind: 'loan',
      payload: {
        loanId: 'loan-1',
        type: 'Auto',
        balance: 18400,
        monthlyPayment: 412
      }
    };
    const location: LocationEntityCard = {
      id: 2,
      entityId: 'location:branch-1',
      kind: 'location',
      payload: { locationId: 'branch-1', name: 'Clarendon Branch', address: '' }
    };
    const recurring: RecurringChargeEntityCard = {
      id: 3,
      entityId: 'NETFLIX|15.49',
      kind: 'recurring',
      payload: {
        chargeId: 'NETFLIX|15.49',
        description: 'NETFLIX',
        averageAmount: 15.49,
        monthsSeen: 3,
        lastDate: '2026-11-02'
      }
    };

    const loanText = 'Your Auto loan is the largest debt.';
    const [anchoredLoan] = anchorEntityCards(loanText, [loan]);
    expect(anchoredLoan?.afterText).toBe(loanText.indexOf('loan'));

    const branchText = 'The Clarendon Branch is closest.';
    const [anchoredLocation] = anchorEntityCards(branchText, [location]);
    expect(anchoredLocation?.afterText).toBe(branchText.indexOf('is'));

    const recurringText = 'Your NETFLIX charge repeats.';
    const [anchoredRecurring] = anchorEntityCards(recurringText, [recurring]);
    expect(anchoredRecurring?.afterText).toBe(recurringText.indexOf('charge'));
  });

  it('leaves non-target cards unchanged, keeps copies, and never throws', () => {
    const list = transactionListCard(
      { items: [{ _id: 'a', description: 'APPLE', amount: 1 }] },
      55,
      2
    );
    if (!list) throw new Error('expected list card');
    const anchored = anchorEntityCards('APPLE and City Power.', [
      list,
      bill(3, 'City Power', 9)
    ]);

    expect(anchored[0]?.kind).toBe('transaction-list');
    expect(anchored[0]?.afterText).toBe(55);
    expect(anchored[0]).not.toBe(list);
    expect(anchored[1]?.afterText).toBe('APPLE and City Power.'.length);

    expect(anchorEntityCards(null as unknown as string, [bill(1, 'City Power')])).toHaveLength(1);
    expect(anchorEntityCards('text', null as unknown as EntityCard[])).toEqual([]);
    expect(anchorEntityCards('text', [null as unknown as EntityCard])).toEqual([]);
  });

  it('anchors rewards after their label and cashflow after the period', () => {
    const reward: RewardEntityCard = {
      id: 1,
      entityId: 'reward:acct-1',
      kind: 'reward',
      payload: { rewardId: 'acct-1', label: 'Venture Rewards', points: 24850 }
    };
    const cashflow: CashflowPointEntityCard = {
      id: 2,
      entityId: 'cashflow:2026-10',
      kind: 'cashflow',
      payload: { period: 'October 2026', inflow: 6100, outflow: 4800, net: 1300 }
    };
    const goal: GoalEntityCard = {
      id: 3,
      entityId: 'goal:acct-1:20000',
      kind: 'goal',
      payload: {
        goalId: 'goal:acct-1:20000',
        target: 20000,
        current: 12640,
        monthsToTarget: 4
      },
      afterText: 77
    };

    const rewardText = 'Your Venture Rewards balance is growing.';
    const [anchoredReward] = anchorEntityCards(rewardText, [reward]);
    expect(anchoredReward?.afterText).toBe(rewardText.indexOf('balance'));

    const cashflowText = 'In October 2026, you had more coming in.';
    const [anchoredCashflow] = anchorEntityCards(cashflowText, [cashflow]);
    expect(anchoredCashflow?.afterText).toBe(cashflowText.indexOf(',') + 1);

    const goalText = 'Your savings goal is within reach.';
    const [anchoredGoal] = anchorEntityCards(goalText, [goal]);
    expect(anchoredGoal?.afterText).toBe(77);
  });

  it('anchors merchants and profiles after their name', () => {
    const merchant: MerchantEntityCard = {
      id: 1,
      entityId: 'merchant:m-1',
      kind: 'merchant',
      payload: { merchantId: 'm-1', name: 'Whole Foods Market' }
    };
    const profile: ProfileEntityCard = {
      id: 2,
      entityId: 'profile:cust-maya',
      kind: 'profile',
      payload: { customerId: 'cust-maya', name: 'Maya Chen' },
      afterText: 99
    };

    const merchantText = 'Whole Foods Market is nearby.';
    const [anchoredMerchant] = anchorEntityCards(merchantText, [merchant]);
    expect(anchoredMerchant?.afterText).toBe(merchantText.indexOf('is'));

    const profileText = 'Maya Chen banks here.';
    const [anchoredProfile] = anchorEntityCards(profileText, [profile]);
    expect(anchoredProfile?.afterText).toBe(profileText.indexOf('banks'));

    const firstNameText = 'I found your profile, Maya.';
    const [fallbackProfile] = anchorEntityCards(firstNameText, [profile]);
    expect(fallbackProfile?.afterText).toBe(firstNameText.indexOf('.') + 1);
  });

  it('leaves goal and list cards unchanged while anchoring a merchant', () => {
    const merchant: MerchantEntityCard = {
      id: 1,
      entityId: 'merchant:m-1',
      kind: 'merchant',
      payload: { merchantId: 'm-1', name: 'Blue Bottle Coffee' }
    };
    const goal: GoalEntityCard = {
      id: 2,
      entityId: 'goal:acct-1:20000',
      kind: 'goal',
      payload: { goalId: 'goal:acct-1:20000', target: 20000, current: 5000, monthsToTarget: 4 },
      afterText: 33
    };
    const list = transactionListCard(
      { items: [{ _id: 'a', description: 'APPLE', amount: 1 }] },
      44,
      3
    );
    if (!list) throw new Error('expected list card');

    const anchored = anchorEntityCards('Try Blue Bottle Coffee this week.', [
      merchant,
      goal,
      list
    ]);

    expect(anchored[0]?.afterText).toBe('Try Blue Bottle Coffee this week.'.indexOf('this'));
    expect(anchored[1]).toEqual(goal);
    expect(anchored[2]).toEqual(list);
  });

  it('preserves bill and account cards through mergeEntityCards without counting the cap', () => {
    const billCardValue = bill(1, 'City Power', 5);
    const accountCardValue = account(2, 'Everyday Checking', 'Checking', 6);
    const lists = mergeEntityCards([billCardValue, accountCardValue], [transactionCard(1, 'x')]);

    expect(lists.map((entry) => entry.kind)).toEqual(['bill', 'account', 'transaction']);
    expect(lists[0]).toBe(billCardValue);
    expect(lists[1]).toBe(accountCardValue);
  });
});

describe('climateWiseCard', () => {
  const report = {
    asOf: '2026-11-14',
    days: 90,
    totalKg: 412.35,
    totalSpend: 3000,
    purchaseCount: 42,
    kgPerDollar: 0.14,
    annualizedTonnes: 1.67,
    benchmarkTonnes: 16,
    targetTonnes: 2.5,
    score: 712,
    tier: 'Good',
    categories: [
      { id: 'transport', label: 'Travel & transport', kg: 180.2, spend: 62, count: 3, share: 0.43 },
      { id: 'food', label: 'Food & dining', kg: 120.5, spend: 400, count: 20, share: 0.29 },
      { id: 'housing', label: 'Housing', kg: 0, spend: 900, count: 1, share: 0 }
    ],
    nudges: [
      { category: 'transport', title: 'Swap two drives a week for the T or a bike', body: '', savingKgPerMonth: 6, prompt: '' }
    ],
    topPurchases: [{ id: 'tx-1', kind: 'withdrawal', amount: 62, description: 'SHELL', date: '2026-10-01', kg: 180.2 }]
  };

  it('parses a direct report payload into one full climatewise card', () => {
    const card = climateWiseCard(report, 42, 7, { customerId: 'cust-1' }) as ClimateWiseEntityCard;

    expect(card).toMatchObject({
      id: 7,
      entityId: 'climatewise',
      kind: 'climatewise',
      afterText: 42,
      payload: {
        report: {
          score: 712,
          tier: 'Good',
          totalKg: 412.35,
          days: 90,
          annualizedTonnes: 1.67,
          benchmarkTonnes: 16
        },
        topCategory: 'Travel & transport',
        customerId: 'cust-1'
      }
    });
    // The full report is retained for the adaptive card.
    expect(card.payload.report.categories).toHaveLength(3);
    expect(card.payload.report.topPurchases).toHaveLength(1);
    expect(card.payload).not.toHaveProperty('score');
    expect(card.payload).not.toHaveProperty('totalKg');
  });

  it('accepts a { report } wrapper from the API route', () => {
    const card = climateWiseCard({ report }, 0, 1);
    expect(card?.kind).toBe('climatewise');
    expect(card?.payload.report.score).toBe(712);
    expect(card?.payload.report.totalKg).toBe(412.35);
    expect(card?.payload).not.toHaveProperty('customerId');
  });

  it('derives the top category from the highest positive kg value', () => {
    const card = climateWiseCard(
      {
        ...report,
        categories: [
          { id: 'food', label: 'Food & dining', kg: 90 },
          { id: 'transport', label: 'Travel & transport', kg: 240 },
          { id: 'energy', label: 'Home energy', kg: 120 }
        ]
      },
      0,
      1
    );
    expect(card?.payload.topCategory).toBe('Travel & transport');
  });

  it('omits topCategory when every category is empty', () => {
    const card = climateWiseCard(
      { ...report, categories: [{ id: 'food', label: 'Food & dining', kg: 0 }] },
      0,
      1
    );
    expect(card?.payload).not.toHaveProperty('topCategory');
  });

  it('rejects malformed payloads instead of throwing', () => {
    expect(climateWiseCard(null, 0, 1)).toBeNull();
    expect(climateWiseCard(undefined, 0, 1)).toBeNull();
    expect(climateWiseCard('climate', 0, 1)).toBeNull();
    expect(climateWiseCard({}, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, score: undefined }, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, score: 'high' }, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, tier: '' }, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, totalKg: undefined }, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, totalKg: -1 }, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, categories: undefined }, 0, 1)).toBeNull();
    expect(climateWiseCard({ ...report, categories: 'none' }, 0, 1)).toBeNull();
  });
});
