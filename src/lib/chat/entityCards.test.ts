import { describe, expect, it } from 'vitest';
import {
  anomalyTransactionCards,
  mergeEntityCards,
  type EntityCard,
  type TransactionEntityCard
} from './entityCards.js';

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
