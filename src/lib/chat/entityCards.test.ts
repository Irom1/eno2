import { describe, expect, it } from 'vitest';
import {
  anchorTransactionCards,
  anomalyExplanation,
  anomalyTransactionCards,
  mergeEntityCards,
  mergeTransactionListCards,
  transactionListCard,
  type EntityCard,
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

  it('maps every non-duplicate type to unusual', () => {
    const cards = anomalyTransactionCards(
      payload([
        { type: 'outlier', description: 'A', amount: 1, date: '2026-01-01' },
        { type: 'mystery', description: 'B', amount: 2, date: '2026-01-02' },
        { type: 42, description: 'C', amount: 3, date: '2026-01-03' }
      ]),
      0,
      1,
      3
    );

    expect(cards.map((card) => card.payload.flag)).toEqual(['unusual', 'unusual', 'unusual']);
  });

  it('caps at two cards by default and honours a custom cap', () => {
    const findings = Array.from({ length: 5 }, (_, index) => ({
      type: 'outlier',
      description: `CHARGE ${index}`,
      amount: index + 1,
      date: '2026-11-01'
    }));

    expect(anomalyTransactionCards(payload(findings), 0, 1)).toHaveLength(2);
    expect(anomalyTransactionCards(payload(findings), 0, 1, 1)).toHaveLength(1);
    expect(anomalyTransactionCards(payload(findings), 0, 1, 0)).toEqual([]);
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
    payload: { description, amount: 100 + id, date: '2026-11-02', flag },
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

    expect(sentence).toBe(
      'You have a suspiciously large transaction at APPLE STORE and a possible duplicate transaction at NETFLIX.COM.'
    );
    expect(sentence).not.toContain('$');
    expect(sentence).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(sentence.toLowerCase()).not.toContain('outlier');
  });

  it('handles a single unusual or duplicate card', () => {
    expect(anomalyExplanation([transactionCard(1, 'APPLE STORE')])).toBe(
      'You have a suspiciously large transaction at APPLE STORE.'
    );
    expect(anomalyExplanation([transactionCard(1, 'NETFLIX.COM', 'duplicate')])).toBe(
      'You have a possible duplicate transaction at NETFLIX.COM.'
    );
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
    const card = transactionListCard({ items }, 0, 1, 2);
    expect(card?.payload.rows).toHaveLength(2);
    expect(card?.payload.more).toBe(3);
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
      payload: { description: entityId, amount: id, date: '', flag: 'unusual' }
    };
  }

  it('merges by entityId, preserves first occurrence order, and caps total', () => {
    const merged = mergeEntityCards(
      [card(1, 'a'), card(2, 'b')],
      [card(3, 'a'), card(4, 'c'), card(5, 'd')]
    );

    expect(merged.map((entry) => entry.entityId)).toEqual(['a', 'b']);
    expect(merged.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it('deduplicates within each input list', () => {
    const merged = mergeEntityCards([card(1, 'a'), card(2, 'a')], [card(3, 'b'), card(4, 'b')]);
    expect(merged.map((entry) => entry.entityId)).toEqual(['a', 'b']);
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
