import { describe, expect, it } from 'vitest';
import { asItems, asRecord } from './payloads';

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
